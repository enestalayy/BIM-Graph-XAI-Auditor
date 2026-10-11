"""Duplex federated model - independent gold-standard annotation.

Run from the repository root:

    .venv/bin/python -I evaluation/gold/annotators/duplex_annotate.py \
        [--root .] [--out evaluation/gold/duplex.json] [--details <path.json>]

What it does
------------
Reads the requirement specification (rules/default.json) and the two IFC2X3
models of the Duplex project and decides, rule by rule, which elements truly
violate each rule. It deliberately does NOT use any code of the system under
evaluation (packages/, apps/, tools/); everything is re-implemented here with
IfcOpenShell + numpy so that the labels are an independent reference.

Criteria (see also duplex-annotation-report.md)
-----------------------------------------------
* Class selectors: an element matches a class if `is_a(cls)` is true
  (subtypes included). IFC4-only names are mapped to their IFC2X3 meaning:
  - IfcBuiltElement            -> IfcBuildingElement (same concept, renamed)
  - IfcDuctSegment, IfcPipeSegment, IfcCableCarrierSegment, IfcDamper, ...
    (occurrence classes that only exist from IFC4 on) -> any element whose
    type object is an instance of `<cls>Type` (IfcDuctSegmentType, ...).
* Property values: element psets plus psets inherited from the type object.
  `exists` = a value is present and not blank. A value that merely repeats
  the property name (e.g. FireRating = "FireRating" / "Fire Rating") is an
  unfilled Revit placeholder: it is treated as NOT existing, and every such
  case is recorded in the details so it is never decided silently.
* Intersection rules (subject passes through object):
  1. Exact triangulated geometry in world coordinates (openings subtracted
     from walls/slabs, i.e. the physical element).
  2. Candidate pairs = axis-aligned bounding boxes overlapping by > 1 mm on
     every axis (a necessary, not sufficient, condition).
  3. Overlap volume = "shifted lattice" estimator: a regular grid with a
     random offset is laid over the box where the two AABBs overlap; a grid
     point counts when it lies inside BOTH closed meshes (generalised
     winding number > 0.5). volume = count * h^3 (unbiased). Two independent
     offsets are evaluated; their spread is the sampling uncertainty.
     Validated against exact divergence-theorem volumes of 35 elements
     (mean error +0.1 %, sd 0.8 %).
     If every surface probe (vertices, edge midpoints, face centroids) of one
     element lies inside the other, the overlap is that whole element and its
     exact mesh volume is used instead ("exact-contained").
     Meshes are re-oriented consistently first (Revit exports contain
     flipped cap triangles that break both volume and winding computations).
  4. Interpenetration (tolerance 1 mm, touching faces are not clashes): the
     overlap must have a thickness of at least 1 mm. Thickness is estimated as
     2 * max over overlap points of min(distance to surface A, distance to
     surface B) (diameter of the largest ball found inside the overlap).
  5. minVolume: best estimate >= minVolume. Pairs within +-25 % of the
     threshold are recomputed with a 10x denser lattice and 4 offsets and
     listed as borderline; within +-5 % (or offsets on both sides of the
     threshold) they are "decision-critical".
  6. mitigation: a matching element whose mesh lies within maxDistance of
     the centroid of the overlap points cancels the violation.
  7. IfcOpenShell's built-in BVH clash detector (geom.tree.clash_*) was
     evaluated as a cross-check but returns no clashes at all in this build
     (see tree_diagnostic); it is therefore not used for any decision.
"""

import argparse
import json
import multiprocessing
import os
import sys
import time

import numpy as np
import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.util.element as uel

MODELS = ["Duplex_A_20110907.ifc", "Duplex_MEP_20110907.ifc"]
PENETRATION_TOL = 0.001  # m - overlaps thinner than this are "touching"
BORDERLINE_REL = 0.25  # +-25 % around minVolume: refined and listed as borderline
CRITICAL_REL = 0.05  # +-5 %: decision-critical (method + tessellation uncertainty)
LATTICE_TARGET_POINTS = 40_000
LATTICE_MAX_POINTS = 600_000
LATTICE_MIN_SPACING = 0.0002  # m
LATTICE_SEEDS = (11, 23)
REFINE_TARGET_POINTS = 400_000
REFINE_MAX_POINTS = 3_000_000
REFINE_SEEDS = (101, 202, 303, 404)
DEPTH_SAMPLE = 1500  # overlap points used for the thickness estimate

IFC4_RENAMES = {"IfcBuiltElement": "IfcBuildingElement"}


# ---------------------------------------------------------------- selectors
def has_entity(model, name):
    """True if the model's schema declares an entity with this name."""
    try:
        ifcopenshell.ifcopenshell_wrapper.schema_by_name(model.schema).declaration_by_name(name)
        return True
    except RuntimeError:  # raised by IfcOpenShell for unknown entity names
        return False


def element_type(el):
    try:
        return uel.get_type(el)
    except Exception:
        return None


def matches_class(el, cls):
    """Class test incl. subtypes, with IFC4 -> IFC2X3 mapping (see header)."""
    model = el.file
    cls = cls if has_entity(model, cls) else IFC4_RENAMES.get(cls, cls)
    if has_entity(model, cls):
        return el.is_a(cls)
    # occurrence class missing in this schema: decide through the type object
    if has_entity(model, cls + "Type"):
        t = element_type(el)
        return bool(t is not None and t.is_a(cls + "Type"))
    return False


def is_placeholder(prop, value):
    norm = lambda s: "".join(str(s).split()).lower()
    return norm(value) == norm(prop)


def get_value(el, prop):
    """Returns (value, source) for 'name', 'predefinedType' or 'Pset.Prop'."""
    if prop == "name":
        return el.Name, "attr"
    if prop == "predefinedType":
        v = getattr(el, "PredefinedType", None)
        if v in (None, "NOTDEFINED", "USERDEFINED"):
            t = element_type(el)
            tv = getattr(t, "PredefinedType", None) if t is not None else None
            if tv not in (None,):
                return tv, "type"
        return v, "attr"
    pset, name = prop.split(".", 1)
    psets = uel.get_psets(el)  # includes psets inherited from the type
    if pset in psets and name in psets[pset]:
        return psets[pset][name], "pset"
    return None, None


PLACEHOLDERS = []  # (GlobalId, property, value) - recorded, never silent


def condition_holds(el, cond):
    value, _ = get_value(el, cond["property"])
    op = cond["op"]
    if op == "exists":
        if value is None or str(value).strip() == "":
            return False
        if "." in cond["property"] and is_placeholder(cond["property"].split(".", 1)[1], value):
            PLACEHOLDERS.append((el.GlobalId, cond["property"], value))
            return False
        return True
    if op == "eq":
        return value is not None and str(value) == str(cond["value"])
    if op == "contains":
        return value is not None and str(cond["value"]) in str(value)
    raise ValueError(f"unknown op {op}")


def select(models, selector):
    out = []
    for m in models:
        for el in m.by_type("IfcProduct"):
            if any(matches_class(el, c) for c in selector["classes"]) and all(
                condition_holds(el, w) for w in selector.get("where", [])
            ):
                out.append(el)
    return out


# ----------------------------------------------------------------- geometry
def geometry_settings():
    s = geom.settings()
    s.set("use-world-coords", True)
    s.set("weld-vertices", True)
    return s


def orient_consistently(tri):
    """Makes triangle winding consistent and outward, per connected shell.

    Revit exports (e.g. the mapped pipe prisms) contain closed meshes with
    flipped cap triangles. Both the divergence-theorem volume and the winding
    number test need a consistent orientation, so faces are re-oriented by a
    breadth-first walk over shared edges (neighbours must traverse a shared
    edge in opposite directions), then each shell is flipped if its signed
    volume is negative.
    """
    tri = tri.copy()
    key = np.round(tri.reshape(-1, 3) / 1e-7).astype(np.int64)
    _, idx = np.unique(key, axis=0, return_inverse=True)
    f = idx.reshape(-1, 3)
    edges = {}
    for fi, (a, b, c) in enumerate(f):
        for u, v in ((a, b), (b, c), (c, a)):
            edges.setdefault((min(u, v), max(u, v)), []).append(fi)
    flipped = np.zeros(len(f), dtype=bool)
    seen = np.zeros(len(f), dtype=bool)
    comp = -np.ones(len(f), dtype=int)

    def directed(fi):
        a, b, c = f[fi]
        if flipped[fi]:
            a, b, c = a, c, b
        return {(a, b), (b, c), (c, a)}

    ncomp = 0
    for start in range(len(f)):
        if seen[start]:
            continue
        seen[start] = True
        comp[start] = ncomp
        queue = [start]
        while queue:
            fi = queue.pop()
            d = directed(fi)
            for u, v in d:
                for nb in edges[(min(u, v), max(u, v))]:
                    if nb == fi or seen[nb]:
                        continue
                    # neighbour must use the edge as (v, u); otherwise flip it
                    if (u, v) in directed(nb):
                        flipped[nb] = True
                    seen[nb] = True
                    comp[nb] = ncomp
                    queue.append(nb)
        ncomp += 1
    tri[flipped] = tri[flipped][:, [0, 2, 1]]
    for k in range(ncomp):
        sel = comp == k
        t = tri[sel] - tri[sel].reshape(-1, 3).mean(0)
        if np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() < 0:
            tri[sel] = tri[sel][:, [0, 2, 1]]
    return tri


def load_meshes(models):
    meshes = {}
    for m in models:
        it = geom.iterator(geometry_settings(), m, multiprocessing.cpu_count())
        if not it.initialize():
            continue
        while True:
            sh = it.get()
            v = np.asarray(sh.geometry.verts, dtype=float).reshape(-1, 3)
            f = np.asarray(sh.geometry.faces, dtype=np.int64).reshape(-1, 3)
            if len(f):
                tri = orient_consistently(v[f])
                meshes[sh.guid] = {"tri": tri, "lo": v.min(0), "hi": v.max(0)}
            if not it.next():
                break
    return meshes


def mesh_volume(tri):
    t = tri - tri.reshape(-1, 3).mean(0)  # centring limits round-off far from origin
    return abs(np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum()) / 6.0


def winding_inside(points, tri):
    """Generalised winding number (Jacobson et al.) - robust point-in-mesh."""
    inside = np.zeros(len(points), dtype=bool)
    chunk = max(1, int(3e6 // len(tri)))
    for s in range(0, len(points), chunk):
        p = points[s : s + chunk, None, :]
        a, b, c = tri[None, :, 0] - p, tri[None, :, 1] - p, tri[None, :, 2] - p
        la, lb, lc = (np.linalg.norm(x, axis=2) for x in (a, b, c))
        num = np.einsum("ptk,ptk->pt", a, np.cross(b, c))
        den = (
            la * lb * lc
            + np.einsum("ptk,ptk->pt", a, b) * lc
            + np.einsum("ptk,ptk->pt", b, c) * la
            + np.einsum("ptk,ptk->pt", c, a) * lb
        )
        w = np.arctan2(num, den).sum(axis=1) / (2 * np.pi)
        inside[s : s + chunk] = np.abs(w) > 0.5
    return inside


def _seg_dist2(p, a, b):
    ab = b - a
    t = np.einsum("ptk,ptk->pt", p - a, ab) / np.maximum(np.einsum("ptk,ptk->pt", ab, ab), 1e-30)
    t = np.clip(t, 0, 1)[..., None]
    d = p - (a + t * ab)
    return np.einsum("ptk,ptk->pt", d, d)


def surface_distance(points, tri):
    """Unsigned distance from each point to the triangle mesh surface."""
    out = np.empty(len(points))
    chunk = max(1, int(1e6 // len(tri)))
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nn = np.linalg.norm(n, axis=1)
    ok = nn > 1e-14
    n = np.where(ok[:, None], n / np.maximum(nn, 1e-30)[:, None], 0)
    for s in range(0, len(points), chunk):
        p = points[s : s + chunk, None, :]
        a, b, c = tri[None, :, 0], tri[None, :, 1], tri[None, :, 2]
        dist_plane = np.einsum("ptk,tk->pt", p - a, n)
        q = p - dist_plane[..., None] * n[None]
        # inside-triangle test by same-side cross products
        c1 = np.einsum("ptk,tk->pt", np.cross(b - a, q - a), n)
        c2 = np.einsum("ptk,tk->pt", np.cross(c - b, q - b), n)
        c3 = np.einsum("ptk,tk->pt", np.cross(a - c, q - c), n)
        inside = (c1 >= 0) & (c2 >= 0) & (c3 >= 0) & ok[None]
        pb = np.broadcast_to(p, (p.shape[0], len(tri), 3))
        ab_, bb_, cb_ = (np.broadcast_to(x, pb.shape) for x in (a, b, c))
        edge = np.minimum(np.minimum(_seg_dist2(pb, ab_, bb_), _seg_dist2(pb, bb_, cb_)), _seg_dist2(pb, cb_, ab_))
        d2 = np.where(inside, dist_plane**2, edge)
        out[s : s + chunk] = np.sqrt(d2.min(axis=1))
    return out


def lattice(lo, hi, seed, target=LATTICE_TARGET_POINTS, max_points=LATTICE_MAX_POINTS):
    """Regular grid of spacing h with a random offset (shifted-lattice estimator)."""
    d = np.maximum(hi - lo, 1e-9)
    h = max(min(np.cbrt(np.prod(d) / target), d.min() / 10), LATTICE_MIN_SPACING)
    while np.prod(np.ceil(d / h)) > max_points:
        h *= 1.15
    n = np.ceil(d / h).astype(int)
    u = np.random.default_rng(seed).random(3)
    axes = [lo[i] + (np.arange(n[i]) + u[i]) * h for i in range(3)]
    pts = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1).reshape(-1, 3)
    return pts, h


def surface_probes(tri):
    """Vertices, edge midpoints and face centroids of a mesh."""
    mids = np.concatenate([(tri[:, 0] + tri[:, 1]) / 2, (tri[:, 1] + tri[:, 2]) / 2, (tri[:, 2] + tri[:, 0]) / 2])
    return np.unique(np.concatenate([tri.reshape(-1, 3), mids, tri.mean(1)]), axis=0)


def contained_in(inner, outer):
    """True if every surface probe of `inner` lies inside `outer`.

    Then the overlap equals the whole inner solid, whose volume is known
    exactly (divergence theorem), so no sampling error enters the decision.
    """
    probes = surface_probes(inner["tri"])
    if np.any(probes < outer["lo"] - 1e-9) or np.any(probes > outer["hi"] + 1e-9):
        return False
    return bool(winding_inside(probes, outer["tri"]).all())


def overlap(ma, mb, seeds=LATTICE_SEEDS, target=LATTICE_TARGET_POINTS, max_points=LATTICE_MAX_POINTS):
    """Overlap volume (shifted lattices or exact if contained), thickness, centroid."""
    lo, hi = np.maximum(ma["lo"], mb["lo"]), np.minimum(ma["hi"], mb["hi"])
    # test the mesh with fewer triangles first, the other only where needed
    first, second = (ma, mb) if len(ma["tri"]) <= len(mb["tri"]) else (mb, ma)
    vols, all_in, h_used = [], [], None
    for seed in seeds:
        pts, h = lattice(lo, hi, seed, target, max_points)
        h_used = h
        sel = winding_inside(pts, first["tri"])
        cand = pts[sel]
        both = cand[winding_inside(cand, second["tri"])] if len(cand) else cand
        vols.append(len(both) * h**3)
        all_in.append(both)
    both = np.concatenate(all_in)
    res = {"vol": float(np.mean(vols)), "vols": [float(v) for v in vols], "h": float(h_used),
           "n": int(len(both)), "method": "lattice", "contained": None}
    if len(both) == 0:
        res.update(thickness=0.0, centre=None)
        return res
    for name, inner, outer in (("subject", ma, mb), ("object", mb, ma)):
        if contained_in(inner, outer):
            res.update(vol=mesh_volume(inner["tri"]), method="exact-contained", contained=name)
            break
    sample = both
    if len(sample) > DEPTH_SAMPLE:
        sample = sample[np.random.default_rng(5).choice(len(sample), DEPTH_SAMPLE, replace=False)]
    depth = np.minimum(surface_distance(sample, ma["tri"]), surface_distance(sample, mb["tri"]))
    res.update(thickness=float(2 * depth.max()), centre=both.mean(0).tolist())
    return res


def refine_overlap(ma, mb):
    """Denser lattice (10x points, 4 offsets) for pairs near a volume threshold."""
    res = overlap(ma, mb, REFINE_SEEDS, REFINE_TARGET_POINTS, REFINE_MAX_POINTS)
    res["method"] = res["method"] + "+refined" if res["method"] == "lattice" else res["method"]
    return res


def aabb_overlaps(ma, mb, tol=PENETRATION_TOL):
    return bool(np.all(np.minimum(ma["hi"], mb["hi"]) - np.maximum(ma["lo"], mb["lo"]) > tol))


def tree_diagnostic(model):
    """Documents the behaviour of IfcOpenShell's built-in BVH clash detector.

    The task asked to use geom.tree's clash methods as an exact detector. In
    this IfcOpenShell 0.8.5 build they return no clashes at all, even for
    obvious contacts (walls standing on slabs in the same file), whereas
    tree.select_box works. They are therefore NOT used for any decision; the
    counts are only recorded so a re-run documents the situation.
    """
    tree = geom.tree()
    tree.add_file(model, geometry_settings())
    walls, slabs = model.by_type("IfcWall"), model.by_type("IfcSlab")
    return {
        "walls": len(walls), "slabs": len(slabs),
        "collision_allow_touching": len(tree.clash_collision_many(walls, slabs, True)),
        "intersection_tol_1mm": len(tree.clash_intersection_many(walls, slabs, PENETRATION_TOL, True)),
        "clearance_50mm": len(tree.clash_clearance_many(walls, slabs, 0.05, True)),
        "select_box_hits_first_wall": len(tree.select_box(walls[0])) if walls else 0,
    }


SEGMENT_TR = {
    "IfcDuctSegmentType": "hava kanalı", "IfcPipeSegmentType": "boru",
    "IfcCableSegmentType": "elektrik konduiti", "IfcCableCarrierSegmentType": "kablo taşıyıcı",
}
OBJECT_TR = {
    "IfcWall": "duvarın", "IfcSlab": "döşemenin", "IfcCovering": "kaplamanın/asma tavanın",
    "IfcBeam": "kirişin", "IfcDoor": "kapının", "IfcWindow": "pencerenin", "IfcColumn": "kolonun",
}


def tr_segment(el):
    t = element_type(el)
    return SEGMENT_TR.get(t.is_a() if t is not None else "", "tesisat segmenti")


def tr_object(el):
    if el.is_a("IfcSlab") and getattr(el, "PredefinedType", None) == "ROOF":
        return "çatı döşemesinin"
    for cls, word in OBJECT_TR.items():
        if el.is_a(cls):
            return word
    return "yapı elemanının"


def short_name(el):
    t = element_type(el)
    return f"{el.is_a()}[{t.is_a() if t is not None else '-'}] {el.Name}"


# --------------------------------------------------------------- rule kinds
def fmt_l(v):
    return f"{v * 1000:.3f}".replace(".", ",") + " L"


def property_rule(rule, models):
    labels, details = [], []
    for el in select(models, rule["target"]):
        failed = [r["property"] for r in rule["require"] if not condition_holds(el, r)]
        raw = {r["property"]: get_value(el, r["property"])[0] for r in rule["require"]}
        details.append({"guid": el.GlobalId, "name": el.Name, "failed": failed, "raw": raw})
        if failed:
            what = ", ".join(failed)
            ph = [p for p in failed if raw[p] is not None]
            reason = f"{what} yer tutucu değer ({raw[ph[0]]!r})" if ph else f"{what} tanımlı değil"
            labels.append({"ruleId": rule["id"], "elements": [el.GlobalId], "note": f"{reason}; {el.Name}"})
    return labels, {"targets": len(details), "items": details}


def intersection_rule(rule, models, meshes, cache):
    subjects = [e for e in select(models, rule["subject"])]
    objects = [e for e in select(models, rule["object"])]
    mitig = select(models, rule["mitigation"]) if rule.get("mitigation") else []
    min_vol = float(rule.get("minVolume", 0) or 0)
    labels, pairs, borderline = [], [], []
    no_geom = [e.GlobalId for e in subjects + objects if e.GlobalId not in meshes]
    for s in subjects:
        ms = meshes.get(s.GlobalId)
        if ms is None:
            continue
        for o in objects:
            mo = meshes.get(o.GlobalId)
            if mo is None or not aabb_overlaps(ms, mo):
                continue
            key = (s.GlobalId, o.GlobalId)
            if key not in cache:
                cache[key] = overlap(ms, mo)
            ov = cache[key]
            near = min_vol > 0 and abs(ov["vol"] - min_vol) <= BORDERLINE_REL * min_vol
            if near and ov["method"] == "lattice":
                if key + ("refined",) not in cache:
                    cache[key + ("refined",)] = refine_overlap(ms, mo)
                ov = cache[key + ("refined",)]
            clash = ov["vol"] > 0 and ov["thickness"] >= PENETRATION_TOL
            vol_ok = ov["vol"] >= min_vol
            mitigated_by = None
            if clash and ov["centre"] is not None and mitig:
                c = np.array([ov["centre"]])
                for mel in mitig:
                    mm = meshes.get(mel.GlobalId)
                    if mm is not None and surface_distance(c, mm["tri"])[0] <= rule["mitigation"]["maxDistance"]:
                        mitigated_by = mel.GlobalId
                        break
            violation = clash and vol_ok and mitigated_by is None
            lo_v, hi_v = min(ov["vols"]), max(ov["vols"])
            is_border = clash and min_vol > 0 and abs(ov["vol"] - min_vol) <= BORDERLINE_REL * min_vol
            # decision-critical: the lattice offsets disagree on the side of the
            # threshold, or the best estimate is within +-5 % of it
            critical = clash and min_vol > 0 and (
                (ov["method"] != "exact-contained" and lo_v < min_vol <= hi_v)
                or abs(ov["vol"] - min_vol) <= CRITICAL_REL * min_vol
            )
            thin = ov["vol"] > 0 and ov["thickness"] < 3 * PENETRATION_TOL
            rec = {
                "subject": s.GlobalId, "object": o.GlobalId,
                "subjectName": short_name(s), "objectName": short_name(o),
                "vol_m3": ov["vol"], "vols_m3": ov["vols"], "h_m": ov["h"],
                "volMethod": ov["method"], "contained": ov["contained"],
                "thickness_m": ov["thickness"], "centre": ov["centre"],
                "subjectVol_m3": mesh_volume(ms["tri"]),
                "clash": bool(clash), "violation": bool(violation), "mitigatedBy": mitigated_by,
                "borderline": bool(is_border), "critical": bool(critical), "thinOverlap": bool(thin),
            }
            pairs.append(rec)
            if is_border or (thin and clash):
                borderline.append(rec)
            if violation:
                if ov["contained"] == "subject":
                    how = f"tamamen {tr_object(o)} içinde kalıyor"
                else:
                    how = f"{tr_object(o)} içinden geçiyor"
                exact = " (kesin)" if ov["method"] == "exact-contained" else ""
                labels.append({
                    "ruleId": rule["id"], "elements": [s.GlobalId, o.GlobalId],
                    "note": f"{tr_segment(s)} {how}; kesişim ~{fmt_l(ov['vol'])}{exact}, kesişim kalınlığı ~{ov['thickness'] * 1000:.0f} mm",
                })
    summary = {
        "subjects": len(subjects), "objects": len(objects), "mitigationElements": len(mitig),
        "candidatePairsAABB": len(pairs), "clashes": sum(p["clash"] for p in pairs),
        "violations": len(labels),
        "missingGeometry": no_geom, "pairs": pairs, "borderline": borderline,
    }
    return labels, summary


# ---------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", default="evaluation/gold/duplex.json")
    ap.add_argument("--details", default=None)
    args = ap.parse_args()
    t0 = time.time()
    root = os.path.abspath(args.root)
    with open(os.path.join(root, "rules", "default.json"), encoding="utf-8") as fh:
        rules = json.load(fh)["rules"]
    models = [ifcopenshell.open(os.path.join(root, "data", "duplex", f)) for f in MODELS]
    meshes = load_meshes(models)
    print(f"meshes: {len(meshes)} ({time.time() - t0:.1f}s)", file=sys.stderr)

    details = {"_treeDiagnostic": tree_diagnostic(models[0])}
    print(f"tree diagnostic: {details['_treeDiagnostic']}", file=sys.stderr)
    expected, cache = [], {}
    for rule in rules:
        if rule.get("enabled", True) is False:
            print(f"note: {rule['id']} disabled in spec, still annotated", file=sys.stderr)
        if rule["kind"] == "property":
            labels, det = property_rule(rule, models)
        elif rule["kind"] == "intersection":
            labels, det = intersection_rule(rule, models, meshes, cache)
        else:
            raise ValueError(rule["kind"])
        expected += labels
        details[rule["id"]] = det
        print(f"{rule['id']}: {len(labels)} labels ({time.time() - t0:.1f}s)", file=sys.stderr)

    gold = {
        "dataset": "duplex",
        "annotator": "Bağımsız LLM uzman ajanı (Claude) — IfcOpenShell 0.8.5 kesin geometri; insan örneklem doğrulaması bekliyor",
        "createdAt": "2026-10-11",
        "models": MODELS,
        "ruleSet": "rules/default.json",
        "rules": [r["id"] for r in rules],
        "expected": expected,
    }
    with open(os.path.join(root, args.out), "w", encoding="utf-8") as fh:
        json.dump(gold, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    if args.details:
        uniq_ph = sorted(set(PLACEHOLDERS))
        with open(args.details, "w", encoding="utf-8") as fh:
            json.dump({"rules": details, "placeholders": uniq_ph, "runtime_s": time.time() - t0}, fh, ensure_ascii=False, indent=1, default=str)
    print(f"total labels: {len(expected)}; runtime {time.time() - t0:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
