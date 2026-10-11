# Datasets

All datasets are listed in `data/catalog.json` (id, files, discipline, schema,
licence, attribution, SHA-256). `npm run datasets:fetch [-- <id> ...]` downloads
missing files and verifies every checksum. In the UI (Modeller → Veri seti) or with
`npm run cli -- dataset load <id>` a dataset replaces the working graph and is audited.

| id | Building | Disciplines | Schema | Licence |
|---|---|---|---|---|
| `buildingsmart-scene` | Small single-storey house (in repo) | ARCH, MEP | IFC4X3_ADD2 | CC BY 4.0 |
| `duplex` | Two-storey duplex apartment | ARCH, MEP | IFC2X3 | CC BY 4.0 |
| `clinic` | Medical-dental clinic, real building (redacted) | ARCH, STR, MEP (HVAC), PLU | IFC2X3 | CC BY 4.0 |
| `schependomlaan` | Housing project, Nijmegen (design model) | ARCH | IFC2X3 | Academic use permission |

## Attribution (required)

- **buildingsmart-scene:** © buildingSMART International Ltd., Sample-Test-Files (CC BY 4.0).
- **duplex:** BSI (2020) "Duplex Apartment Test Files," buildingSMART International.
  https://github.com/buildingSMART/Sample-Test-Files — contributed by Bill East (PR #61, 2020). CC BY 4.0, unmodified.
- **clinic:** BSI (2020) "Medical-Dental Test Files," buildingSMART International.
  https://github.com/buildingSMART/Sample-Test-Files — CC BY 4.0, unmodified. The
  electrical model of the set is not used by default.
- **schependomlaan:** Schependomlaan dataset (S. van Schaijk, TU Eindhoven ISBE; Hendriks
  Bouw en Ontwikkeling, ROOT, TNO, RAAMAC). "All data owners have given permission to use
  the data for scientific and academic purposes." Published via buildingSMART Sample-Test-Files.

## Provenance

The buildingSMART repository was renamed (`Certification-datasets`) and its history
rewritten, which removed these models. The URLs in the catalog therefore point to a
fork that preserves the published state, pinned to commit
`jakob-beetz/Sample-Test-Files@a859c603`; the SHA-256 checksums guarantee the files are
byte-identical to what was evaluated.
