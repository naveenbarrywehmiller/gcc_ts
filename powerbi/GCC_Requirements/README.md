# GCC requirements Power BI project

Open **[GCC_Requirements.pbip](GCC_Requirements.pbip)** in Power BI Desktop. The saved project contains **16 tables, 72 DAX measures, 18 relationships, nine report pages and 98 visual containers**. Its semantic model is TMDL in `GCC_Requirements.SemanticModel/definition/`; report pages are native PBIR JSON. The original timesheet PBIX/portable model remains a separate artifact.

**[Complete Power BI guide — POWERBI.md](../POWERBI.md)** includes every DAX formula, all 11 shared Power Query expressions, all 16 table queries, the full column/relationship dictionary, every visual and its field bindings, connection instructions, troubleshooting and missing inputs.

## Connect

1. Connect the refreshing computer to Tailscale and confirm it can reach `https://dietpi.tail4f2b8f.ts.net/`.
2. Open the PBIP and check **Transform data → Edit parameters**. The saved origin is DietPi, `ApiPath=api/powerbi`, January fiscal start and eight-hour weekdays. Optional register endpoint parameters are empty.
3. Set that origin’s Web credentials to **Basic**: username `powerbi`, password the reporting API key or an authorized administrator JWT. Enter credentials in Desktop’s credential store; no token is included in source. Clear obsolete localhost/Anonymous permissions if needed.
4. Refresh, then select the reporting month/division. The saved month is **October 2026**, not a moving current-month selection. Review **Input readiness**, unmapped hours, weekly conflicts, missing project plan inputs and the UTC refresh timestamp.
5. Save intended Desktop edits. Maintain the saved TMDL project; the original `scripts/build-powerbi.py` BIM scaffold refuses to overwrite it.

The live server runs application **v1.15.0**, with reporting API **v1.1.0** verified on 2026-10-02. All nine checked diagnostic/model endpoints responded HTTP 200. The four daily timesheets contain 32 approved hours; the staffing source is empty. Authorized API responses were processed in an isolated native test model, with all 72 measures evaluated and October utilization blank. This does not confirm a refreshed cache in the canonical Desktop report or publication to Power BI Service.

## Inputs still needed

Utilization remains blank until the live categories **SOP 1234** and **vgnn** have approved hour mappings, as requested. Billable does not automatically mean Productive. Additional gaps include monthly staffing submissions, explicit deliverable/error/rework and improvement registers, fiscal/tolerance confirmation, employment/project allocation history and platform/cohort definitions. The complete guide describes each contract and its affected KPIs.

## Validation and sharing

The saved TMDL deserializes through Desktop’s TOM library. Current validation passes **110 Microsoft schema documents** and visual field references. Native isolated synthetic testing evaluated all **72 measures** and passed **23 scenarios**; the API/application checks are described in [validation evidence](../validation/README.md).

GitHub stores source definitions, not credentials or imported production data. A clone needs connection and refresh. Pushing to GitHub updates the application through its Docker workflow; publishing the report, configuring a gateway and scheduling Power BI Service refresh are separate actions. See the complete guide before sharing an imported dataset: the model has no RLS roles.
