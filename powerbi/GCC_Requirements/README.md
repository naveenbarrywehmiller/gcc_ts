# GCC requirements Power BI project

**[User guide: change source URL, password, refresh and report settings](../POWERBI_USER_GUIDE.md)** provides step-by-step maintenance instructions.

Open **[GCC_Requirements.pbip](GCC_Requirements.pbip)** in Power BI Desktop. The saved project contains **16 tables, 72 DAX measures, 18 relationships, nine report pages and 116 visual containers**. Its semantic model is TMDL in `GCC_Requirements.SemanticModel/definition/`; report pages are native PBIR JSON. The unused legacy timesheet PBIX was removed locally; the portable model remains a separate artifact.

**[Complete Power BI guide — POWERBI.md](../POWERBI.md)** includes every DAX formula, all 11 shared Power Query expressions, all 16 table queries, the full column/relationship dictionary, every visual and its field bindings, phone geometry, connection instructions, troubleshooting and missing inputs.

## Management overview design — 1.1.1 (2026-10-06)

The report opens on **GCC | Management overview**. Compact filters lead into four prominent KPI cards, followed by input guidance, monthly actual/training hours, a descending horizontal comparison of actual hours by division, and a division table that includes on-time delivery. Training is a subset of actual hours; the monthly chart follows the selected period. The footer retains manual refresh guidance and the header retains the IST timestamp. Blank KPIs are not presented as zero or assigned an invented target/status. All existing measure calculations are retained.

The overview includes descriptive alt text, reading-order keyboard navigation and a shorter phone layout. The other eight analytical pages remain available for investigation. Local schema, field-binding and layout checks cover the saved project; runtime/data validation is separate from those static checks.

The redesigned overview opened successfully in Desktop using its cached data. Final text-box spacing changes were saved after Windows locked; their native visual review and the phone visual review remain pending. Reopen the project to load the latest file changes. See [management overview validation](../validation/management-overview-validation.json) for the exact check scope.

## DAX optimization — 1.1.2

The saved model includes six tested DAX variable refactors (1.1.2, 2026-10-06). See the [DAX optimization review](../documentation/DAX_OPTIMIZATION_REVIEW.md) for formulas, comparison tests, synthetic benchmark scope and the current report-schema validation limitation. Reopen this project to load the saved formula changes into Desktop.

## Phone layouts

All nine pages have native portrait phone layouts covering all 116 existing visuals. Open **View → Mobile layout** in Desktop and select a page tab. The layouts use a 324-unit canvas, full-width timestamp/dropdown controls, two-column KPI cards, readable wrapped headings/notes and full-width charts. The last-refresh timestamp is small muted text (9 pt label, 10 pt value), with a transparent background and no border/shadow on both desktop and phone views. Detail tables retain all columns with horizontal scrolling; input-readiness definitions wrap into narrow columns.

On an actual phone, these layouts appear in the Power BI iOS/Android app in portrait after the report is published and shared. Ordinary web-browser and landscape viewing use the standard report layout. Service publication has not been performed. See [Microsoft's mobile layout overview](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-create-mobile-optimized-report-about).

## Connect

1. Connect the refreshing computer to Tailscale and confirm it can reach `https://dietpi.tail4f2b8f.ts.net/`.
2. Open the PBIP and check **Transform data → Edit parameters**. The saved origin is DietPi, `ApiPath=api/powerbi`, January fiscal start and eight-hour weekdays. Optional register endpoint parameters are empty.
3. Set that origin’s Web credentials to **Basic**: username `powerbi`, password the reporting API key or an authorized administrator JWT. Enter credentials in Desktop’s credential store; no token is included in source. Clear obsolete localhost/Anonymous permissions if needed.
4. Use **Home → Refresh → Data** to fetch the latest API data for all tables, then select the reporting month/division. Automatic refresh is **off**, as selected for this Desktop report. Every page shows a separate **Last refreshed (IST)** date/time card, including seconds. The saved month is **October 2026**, not a moving current-month selection. Review **Input readiness**, unmapped hours, weekly conflicts and missing project plan inputs.
5. Save intended Desktop edits. Maintain the saved TMDL project; the original `scripts/build-powerbi.py` BIM scaffold refuses to overwrite it.

The live server runs application **v1.15.0**, with reporting API **v1.1.0** verified on 2026-10-02. The canonical Desktop report was refreshed and saved on 2026-10-05 local date. Its saved header before the IST update showed **2026-10-06 06:25:03 UTC**; an aggregate query returned **10 daily rows, 72 raw hours and 32 actual/approved hours**. October utilization remains blank pending the requested task mapping. The overview headings and input-readiness descriptions were checked in Desktop; descriptions wrap without a horizontal scrollbar. No Power BI Service publication or automatic schedule is configured. A fresh clone needs its own local credentials and refresh.

The report uses **Indian Standard Time (IST, UTC+05:30)** for every viewer. The refresh timestamp and the reporting date used by fiscal/forecast calculations share the same IST clock; they do not change with a viewer's location or the refreshing computer's timezone. Source date-only business fields retain their original dates. The historical UTC refresh evidence above predates this update. **Reopen the canonical project, then use Home → Refresh → Data** to import the IST model; a production IST refresh/native preview is pending because Desktop automation was stopped with Escape.

## Inputs still needed

Utilization remains blank until the live categories **SOP 1234** and **vgnn** have approved hour mappings, as requested. Billable does not automatically mean Productive. Additional gaps include monthly staffing submissions, explicit deliverable/error/rework and improvement registers, fiscal/tolerance confirmation, employment/project allocation history and platform/cohort definitions. The complete guide describes each contract and its affected KPIs.

## Validation and sharing

The saved TMDL deserializes through Desktop’s TOM library. Current validation passes **244 Microsoft schema documents** and visual field references. All 116 phone placements fit the canvas width without overlaps across nine pages. Native isolated synthetic testing previously evaluated all **72 measures** and passed **36 scenarios**, including UTC-to-IST conversion, midnight/year rollover, calendar/forecast boundaries and the refresh timestamp/header. The API/application checks are described in [validation evidence](../validation/README.md).

GitHub stores source definitions, not credentials or imported production data. A clone needs connection and refresh. Pushing to GitHub updates the application through its Docker workflow; publishing the report, configuring a gateway and scheduling Power BI Service refresh are separate actions. See the complete guide before sharing an imported dataset: the model has no RLS roles.
