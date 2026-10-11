"""Dump physical elements of an IFC file with world-space AABBs (metres, Z up) as JSON.

Reference implementation for the web-ifc parity check; run via tools/parity/compare.ts.
"""
import json
import sys

import ifcopenshell
import ifcopenshell.geom


def is_physical(element) -> bool:
    return not (element.is_a("IfcFeatureElement") or element.is_a("IfcVirtualElement"))


def main(path: str) -> None:
    model = ifcopenshell.open(path)
    elements = {e.GlobalId: {"ifcClass": e.is_a(), "aabb": None} for e in model.by_type("IfcElement") if is_physical(e)}

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    iterator = ifcopenshell.geom.iterator(settings, model)
    if iterator.initialize():
        while True:
            shape = iterator.get()
            entry = elements.get(shape.guid)
            verts = shape.geometry.verts
            if entry is not None and verts:
                xs, ys, zs = verts[0::3], verts[1::3], verts[2::3]
                entry["aabb"] = [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)]
            if not iterator.next():
                break

    json.dump({"schema": model.schema_identifier, "elements": elements}, sys.stdout)


if __name__ == "__main__":
    main(sys.argv[1])
