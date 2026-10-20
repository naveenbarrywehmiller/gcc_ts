# GCC Dashboard Power BI v2.2.2

Source prerelease dated October 20, 2026. Compatible with reporting API v2.0.0 and GCC Timesheet App v1.29.0+; the accompanying application release is v1.31.6.

## Changes

- Publish the renamed product under `gcc-dashboard-powerbi-v2.2.2`, with a complete committed source/tools ZIP and SHA-256 checksums.
- Open [GCC_Dashboard_v2.2.2.pbip](../GCC_Dashboard/GCC_Dashboard_v2.2.2.pbip). Report and SemanticModel siblings remain together in `powerbi/GCC_Dashboard/`.
- Update the PBIP filename, API `dashboardVersion`, generator, guides, and regression expectations together. The API contract remains v2.0.0; linguistic/report format versions remain `2.0.0`.
- Preserve the committed DAX calculations, table/relationship definitions, logical IDs, and lineage. Unrelated existing Desktop edits remain local and are excluded from the release.

## Package and installation

The ZIP contains the repository source and companion tools under `gcc-dashboard-powerbi-v2.2.2/`, with a `SOURCE_COMMIT.txt` provenance file. It excludes the historical database backup, local databases, environment secrets, dependencies, Desktop caches, and uncommitted files. The complete source keeps tool imports and documentation links resolvable.

Extract the complete ZIP, open the versioned PBIP, and configure the source URL and credentials locally. Follow the [user guide](../documentation/POWERBI_USER_GUIDE.md). Use `SHA256SUMS.txt` or the ZIP's `.sha256` sidecar to verify the download. Historical releases retain their original internal layouts; this new package uses the current GCC Dashboard names throughout its active project.

## Validation and limits

Release checks use an isolated export of the Git index, excluding local Desktop changes. Native TMDL deserialization, Microsoft schema validation, PBIP filename/model resolution, repository mappings, and application/API regressions are checked before tagging. GitHub Actions checks the committed source, both container architectures, and the Linux administrator on a disposable runner.

The isolated local candidate passed **155 Node tests**, **55 reporting API checks**, **24 Linux-admin unit tests**, **254 Microsoft schema documents**, repository links/imports, generated script-reference checks, and Bash syntax. No DAX or business calculations changed in this release.

This naming/package release does not certify new production refresh, native canvas/phone behavior, or business input mappings. The [2.2.1 evidence and data caveats](RELEASE_2.2.1.md) and [earlier native retest](NATIVE_RETEST_2026-10-20.md) remain applicable. Optional quality/improvement registers, project plan inputs, and the unmapped utilization category still require business input. No business data or mappings were fabricated.

Existing dependency audit findings are recorded in [the reorganization validation report](../../docs/REORGANIZATION_VALIDATION.md). The dashboard remains a prerelease while those native/business qualification limits remain unresolved.
