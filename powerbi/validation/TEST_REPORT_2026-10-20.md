# Power BI and reporting test — October 20, 2026

This records the initial inspection before the subsequent **2.2.1** repairs. See [release verification](RELEASE_2.2.1.md) for the fixes and final coverage. Shared geometry/engine JSON files are updated by the later release rerun; the seven overlaps described below were the initial findings.

**Result: calculation and web checks passed; native report preview and phone layouts are not release-ready.**

Tested the repository's `GCC_Dashboard.pbip` definitions and the live application at `http://192.168.0.50:3001` using the supplied System Admin access. The installed Microsoft Power BI Desktop Store application is version **2.159.883.0**, with native engine **17.0.93.23**. This is a local test with a live API snapshot, not a Power BI Service certification.

## Findings

| Priority | Finding | Evidence and effect |
| --- | --- | --- |
| High | Canonical project cannot open in the installed Desktop | Desktop reports an incompatible document. Its diagnostic code is `NewerLinguisticSchemaVersion`. `definition/cultures/en-US.tmdl:5` declares linguistic metadata version `2.1.0`; commit `a2d880b` changed it from the previously saved `2.0.0`. A cache-free copy fails too. Restoring only the report version does not resolve it. Restoring the linguistic version in the temporary copy clears that error, but a later `PackageSession` error prevents canvas inspection. The canonical definitions were not edited. |
| Medium | Platform and Division phone filters overlap on seven pages | `02_utilization`, `03_delivery`, `04_capacity`, `05_teams`, `06_improvement`, `07_staffing`, and `08_detail`. On each page, Platform occupies y=252–356 and Division y=340–444, with the same x=8 and width=308: **16 units of overlap**. The saved 121 phone placements were checked. |
| Medium — input gap | Current utilization is blank because a live category is unmapped | Of 60 submitted/approved hours, **52** use `BW Tec Drawing update`, absent from `HourCategoryMap`. The other eight are Vacation. `[Unmapped Hours] = 52`; `[Effective Hours]` and `[Monthly Utilization %]` correctly return blank under the existing guard. A business owner must approve the category mapping. |
| Medium — input gap | Planning and specialist KPI inputs are incomplete | `[Projects Missing Plan Inputs] = 26`. Deliverable and improvement endpoints are unset, so the corresponding registers remain empty and several quality/improvement KPIs are blank. Successful DAX execution does not establish those missing business values. |
| Low | Input-readiness text is stale | The Platform/cohorts row in `InputStatus.tmdl` says no separate platform master exists. The current model has `DimPlatform`, and the live API returned six platform records. This can mislead report readers. |

The saved `ApiBaseUrl` is `https://dietpi.tail4f2b8f.ts.net`, while this test used the supplied LAN origin. Their equivalence was not assumed or tested. The original connection was retained.

## Completed checks

| Check | Actual coverage | Result |
| --- | --- | --- |
| Native Power Query/model processing | 17 source-model tables, with `fnApi` replaced only inside an isolated test database by a live API snapshot | Pass |
| Every current DAX measure | All **70** measures evaluated individually | Pass |
| DAX scenario assertions | **39** synthetic cases: platform/division/team scope, weekly deduplication/conflicts, missing inputs, capacity, holiday/leave overlap, forecasting, delivery quality, alert colors, and IST boundaries | Pass |
| Live filter-context execution | All 70 measures together across **10** additional contexts: October, empty future month, Dedicated/Flex, and six platforms | Pass; this checks execution, not independent expected values for every cell |
| Live reconciliations | **12** expected-value checks against independently summed API rows: row count, raw/actual/approved hours, two months, six platforms | Pass |
| Visual field queries | **94** generated DAX queries matching saved visual column/measure projections, covering cards, tables, charts, and slicers | Pass; these are field-query checks, not captured native render queries |
| Report documents and references | **254** Microsoft schema documents, plus saved visual field resolution against the semantic model | Pass |
| Desktop visual geometry | **121** visuals across nine pages | No overlap or out-of-canvas bounds |
| Phone geometry | **121** placements across nine pages | Seven overlaps listed above |
| Web reporting views | Weekly Summary, Utilization, Project Hours, Missing Hours, Trends | All loaded |
| Web responsive sweep | Five populated views × **28** checklist sizes = **140** checks, 320–3840 pixels including landscape | No document overflow; header present; no browser exceptions or unexpected API failures |
| Visual screenshot inspection | Mobile Weekly Summary, tablet Utilization, laptop Project Hours, desktop Trends, ultrawide Missing Hours | Inspected; 25 representative screenshots captured locally |
| Web interactions | Submitted/approved status and empty state, previous month, Platform selection/reset, total-hours drilldown/Escape, project expansion/collapse, monthly trend grouping, mobile drilldown bounds | Pass |
| Downloads | Weekly Summary Excel and PDF | Both completed; Excel opened with five sheets and reconciled totals. PDF content/layout was not inspected. |
| Repository regression suite | `npm test`: **153** Node tests plus **55** reporting API checks, using isolated databases | Pass |

Live reconciliation: **50 daily rows**, **252 raw hours** overall; September **92**, October **160**. Submitted/approved actual hours are **60**, with **0 approved**. The October web summary and Excel export show **160 total / 60 pending / 0 approved**. Different raw and actual totals follow the existing status definitions.

## Test repair and evidence

The native harness initially stopped in its second synthetic scenario because two generated rows omitted newly required Platform/Division fields. A one-line change in `scripts/test-powerbi-model.ps1` adds `divisionId`, `platformId`, and `platform` to those rows. The rerun evaluated all 70 measures and passed all 39 assertions. No production DAX, business mappings, or report layouts were changed.

- [Native calculation results](engine-validation.json)
- [Live aggregate/visual-query results](live-app-test-2026-10-20.json)
- [Web checks and exports](web-app-test-2026-10-20.json)
- [Native preview attempts](native-preview-test-2026-10-20.json)
- [Desktop geometry](desktop-layout-test-2026-10-20.json)
- [Phone geometry](mobile-layout-validation.json)
- [Schema validation](schema-validation.json)

Temporary databases created for successful engine tests were dropped. The failed temporary report session and isolated browser were closed. Screenshots and downloaded files remain in the local temporary `gcc-powerbi-web-evidence` directory. Repository evidence contains aggregates, not access tokens or raw employee records.

## Coverage limits and follow-up

Native page drawing, native slicer interactions, tooltips, cross-highlighting, phone preview, and bookmark behavior remain unverified because of the Desktop errors. Resolve the linguistic-schema declaration and retest from a clean Desktop session; the temporary-copy experiment is not a verified production fix. Correct the seven saved phone overlaps and rerun phone geometry/preview checks. Business owners need to supply category mappings and missing register/planning inputs.

The live browser session used System Admin and the light theme. Other live roles, dark mode, forced loading/error states, other browser engines, physical devices, assistive technologies, Power BI Service permissions/RLS, publication, gateways, scheduled refresh, and a canonical authenticated Power BI Web refresh were not exercised. No source performance or production-scale claims are made.
