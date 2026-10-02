# Validation evidence

The deliverable is `../GCC_Requirements/GCC_Requirements.pbip`.

* `schema-validation.json`: 113 Microsoft JSON schema documents validated, plus visual field resolution; zero errors.
* `engine-validation.json`: 72 measures evaluated and 23 scenario assertions passed in Power BI Desktop's native engine. Power Query transformations were processed from isolated synthetic API fixtures. Scenarios cover weekly deduplication/conflicts, unknown versus zero, holidays and vacation, division/team filters, project budget reconciliation, future forecast, delivery cohorts, FTR and conditional alert colors. Numerical sums use a 1e-9 floating-point tolerance.
* `build-summary.json`: table, measure, relationship, page and visual counts.
* Desktop inspection: all nine native report pages load; synthetic-data overview charts and readiness tables render. The saved October 2026 month selection was verified in Desktop after correcting the slicer selection property. The reserved table name, PBIR content version and cached-model compatibility mismatch were corrected. Compatibility level 1606 matches the installed Desktop engine; all calculation scenarios were rerun successfully after that change.
* API validation: the two new endpoint/row-key tests passed; full application regression run passed 52 tests; existing reporting API suite passed 55 checks. Tests used in-memory databases.

Production authentication/refresh, real-data reconciliation, fiscal-year assumptions, deliverable/rework sources, platform/cohort definitions and exact project allocation capacity are pending. The plugin's generic offline review ran, but its BIM heuristic did not enumerate measures; its zero-finding output is not treated as semantic validation. The native engine evidence above is the calculation check.

Reproduce with `node scripts/validate-powerbi.js`, `node --test scripts/powerbi-requirements.test.js`, and `scripts/test-powerbi-model.ps1 -Port <Desktop engine port>`. The latter creates and removes its own uniquely named test database and does not change the user's report model.
