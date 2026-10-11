# Datasets

## buildingSMART sample scene (in repo)

`data/sample/` — see `data/sample/README.md` (CC BY 4.0).

## Duplex Apartment (downloaded)

`npm run datasets:duplex` downloads into `data/duplex/` (not tracked by git) and
verifies SHA-256 checksums.

| File | Discipline | Schema | Authoring tool |
|---|---|---|---|
| `Duplex_A_20110907.ifc` | Architecture | IFC2X3 (Coordination View) | Revit Architecture 2011 |
| `Duplex_MEP_20110907.ifc` | MEP (HVAC, plumbing, electrical) | IFC2X3 (Coordination View) | Revit MEP 2011 |

**Attribution (required by the licence):** BSI (2020) "Duplex Apartment Test Files,"
buildingSMART International. https://github.com/buildingSMART/Sample-Test-Files
(contributed by Bill East, PR #61, November 2020). Licence: Creative Commons
Attribution 4.0 International (CC BY 4.0). The files are used unmodified.

**Provenance note:** the buildingSMART repository was later renamed
(`Certification-datasets`) and its history rewritten, removing these files. The
download script therefore pins a fork that preserves the published state
(`jakob-beetz/Sample-Test-Files@a859c603`); the checksums guard against any change.
