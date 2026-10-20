# GCC Power BI — v2.2.1

Open **[GCC_Requirements_v2.2.1.pbip](GCC_Requirements/GCC_Requirements_v2.2.1.pbip)** in Power BI Desktop. Keep the entire `GCC_Requirements` folder together: the PBIP references its sibling Report and SemanticModel folders.

The Power BI dashboard version is **2.2.1**, independent of application version **1.31.5** and reporting API version **2.0.0**. Requires GCC Timesheet **v1.29.0+**.

| Location | Contents |
|---|---|
| [GCC_Requirements/](GCC_Requirements/) | Active report: 17 tables, 70 DAX measures, nine pages and 121 visuals |
| [documentation/POWERBI_USER_GUIDE.md](documentation/POWERBI_USER_GUIDE.md) | Source URL, credentials, refresh and report settings |
| [documentation/POWERBI.md](documentation/POWERBI.md) | Complete model, formulas, queries and visual reference |
| [documentation/](documentation/) | Setup, troubleshooting, development and release guidance |
| [validation/](validation/) | Schema, calculation, layout and test evidence |
| [legacy/](legacy/) | Older standalone model, queries, theme and dashboard assets |
| [CHANGELOG.md](CHANGELOG.md) | Power BI release history |

```text
powerbi/
  README.md
  CHANGELOG.md
  GCC_Requirements/
    GCC_Requirements_v2.2.1.pbip
    GCC_Requirements.Report/
    GCC_Requirements.SemanticModel/
  documentation/
  validation/
  legacy/
    GCC_Timesheet_Model.bim
    GCC_Timesheet_Model/
    queries/
    theme/
    assets/
```

Open the versioned PBIP after updating an existing checkout; an already-open Desktop session can still retain the former filename. Configure the source and credentials locally, then use **Home → Refresh**. Credentials and imported `.pbi` caches are excluded from Git.

The filename suffix follows the **dashboard** release. When releasing a new dashboard version, rename this single PBIP entry point and update the API's `dashboardVersion` together. The filename/link regression test detects mismatches. Internal report/linguistic format versions remain `2.0.0`.

The reinstalled Desktop successfully refreshed and rendered all nine desktop pages. Native phone testing was interrupted after opening Input readiness; saved phone geometry checks cover all 121 placements. See [the retest record](validation/NATIVE_RETEST_2026-10-20.md) and [release verification](validation/RELEASE_2.2.1.md). Utilization still needs the unmapped category approved; optional quality/improvement registers and project planning inputs remain business prerequisites.
