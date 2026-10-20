# GCC Requirements Power BI 2.2.1

Release date: October 20, 2026. **Source prerelease** for reporting API v2.0.0 and GCC Timesheet v1.29.0+. The application release version remains 1.31.5. The [post-reinstall retest](NATIVE_RETEST_2026-10-20.md) verified all nine desktop pages and canonical refresh; native phone inspection remains partial.

## Changes

- Restored `linguisticMetadata.Version` in `definition/cultures/en-US.tmdl` and the report's `definition/version.json` to their supported format value `2.0.0`. Dashboard version **2.2.1** is independent of these internal formats. The source generator and a regression assertion protect this distinction.
- Moved the Division and following phone controls down 24 units on seven pages, retaining 104-unit dropdown heights and adding an eight-unit gap after Platform. All desktop positions, visual fields, and DAX formulas are retained.
- Corrected the Platform/cohorts input-readiness description and two outdated synthetic test rows. Updated connection/troubleshooting/release documentation.

Current inventory: **17 tables, 70 DAX measures, 20 relationships, 11 shared expressions, nine pages, 121 visuals**.

## Verification

- Installed Store Desktop **2.159.883.0**, native engine **17.0.93.23**: all **70 measures** evaluated and **39 synthetic scenario assertions** passed after the fixes.
- **254** Microsoft schema documents passed, including visual field references against native TMDL deserialization.
- Saved phone geometry: **nine pages / 121 placements**, no overlap, missing placements or width violations. Desktop geometry: **121 visuals**, no overlap or out-of-canvas bounds. Native desktop and phone drawing remain separate from these geometry checks.
- The new internal-format regression test passes. The full `npm test` run passed **154 Node tests and 55 reporting API checks**.
- Earlier same-day live snapshot: **12 reconciliations**, **10 measure contexts**, and **94 visual field queries** passed. The unchanged DAX reconciled 50 daily rows / 252 raw hours, including September 92 and October 160; actual submitted/approved hours were 60 and approved hours zero.
- Earlier same-day Chromium run: all five live report views passed **140** populated responsive checks at the 28 repository checklist sizes. Exercised filters, reset, empty state, drilldowns/Escape, project expansion, monthly trends and mobile dialog bounds passed. Excel/PDF downloads completed; Excel totals reconciled. No web layout source changed in this release.

Initial native opening verification used a fresh Desktop session and a cache-free candidate copy. The original `NewerLinguisticSchemaVersion` error no longer appeared, and the 17-table model loaded, but the canvas initially remained on Home. After reinstalling Desktop, all nine native desktop pages rendered, the canonical data refresh succeeded and month/Platform/Division filters passed. A prior session's `PackageSession` error did not recur. Native phone inspection was interrupted after opening Input readiness, so full native phone UI certification remains pending. See the [retest record](NATIVE_RETEST_2026-10-20.md).

The Power BI plugin's release-candidate workflow was run locally with `-SkipLive`. Its generic parser reported **zero metrics**, the semantic runner reported **zero tests**, and its trust gate returned **No-Go** for a zero KPI trust score. Those outputs do not enumerate this TMDL model's 70 measures and are not treated as native calculation evidence. The native engine and repository tests above provide the calculation checks. Native UI verification and business input gaps still prevent full production certification. No cloud release or dataset refresh was performed.

## Open data prerequisites

The live task category `BW Tec Drawing update` accounts for 52 submitted hours and is absent from `HourCategoryMap`. Existing guards therefore leave effective hours/utilization blank. Its business mapping still needs approval. Twenty-six projects are flagged for missing plan inputs. Deliverable and improvement register endpoints remain unset. These inputs were not fabricated for the release.

## Install or repair

The original `gcc-requirements-powerbi-v2.2.1.zip` GitHub prerelease uses `powerbi/GCC_Requirements/GCC_Requirements.pbip`. The subsequently organized repository uses `powerbi/GCC_Requirements/GCC_Requirements_v2.2.1.pbip`, moves guides into `documentation/`, and groups older assets under `legacy/`. Both entry points reference the same stable Report and SemanticModel sibling names. Keep the complete project folder together. Configure `ApiBaseUrl` and Web credentials locally, then refresh data. Source packages exclude `.pbi` caches, imported production data and credential settings.

For an existing checkout, close Desktop before pulling the release. The [specific metadata repair steps](../documentation/TROUBLESHOOTING.md#incompatible-linguistic-metadata) explain the two format declarations. If an old failed Desktop session reports `PackageSession`, close that session and retry the corrected source from a fresh extraction; do not overwrite source with the failed session.

Power BI Service publication, RLS, gateways and scheduled refresh were not exercised or configured. Other browser engines, physical devices and assistive technology were not tested. The existing saved source origin remains unchanged; the same-day live test used the supplied LAN origin.
