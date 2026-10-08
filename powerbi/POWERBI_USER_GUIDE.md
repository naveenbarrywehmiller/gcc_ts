# GCC Requirements: Power BI editing and maintenance guide

Updated: 6 October 2026. For the GCC Requirements project in this repository.

Use this guide to change the source URL, update connection credentials, refresh data, edit visuals and maintain the report. Menu labels can vary slightly between Power BI Desktop versions.

## Quick reference

| What you want to change | Where to go |
| --- | --- |
| Server URL | Home → Transform data → Edit parameters → `ApiBaseUrl` |
| API path | The same parameter dialog → `ApiPath` |
| Saved connection password/API key | File → Options and settings → Data source settings → select the source → Edit Permissions → Edit credentials |
| Fiscal year start or daily hours | Edit parameters → `FiscalStartMonth` or `DailyHours` |
| Imported data | Home → Refresh → Data, or Home → Refresh if there is no submenu |
| Displayed month/division | Slicers on the report page |
| Chart title, color or size | Select the visual → Format visual |
| KPI calculation | Select its measure under `_Measures` and edit the DAX formula |
| Phone layout | View → Mobile layout |
| Cloud refresh credentials | Power BI Service → workspace → semantic model settings → connection/credentials |

## 1. Open the correct report

Open:

```text
C:\gcc_ts\powerbi\GCC_Requirements\GCC_Requirements.pbip
```

The `.pbip` is the entry point. Keep it together with both sibling folders:

```text
GCC_Requirements/
├── GCC_Requirements.pbip
├── GCC_Requirements.Report/
└── GCC_Requirements.SemanticModel/
```

Save your current Desktop edits before changing anything. To make a backup, save and close Desktop, then copy the entire `GCC_Requirements` folder. Copying only the small `.pbip` file does not copy the report and model definitions. A copied project may also contain cached business data; keep the backup in an appropriate location.

This guide describes the PBIP project above. A separately exported `.pbix` is a separate copy; editing it will not automatically update this project's source files.

## 2. Change the source link / server URL

### Current source settings

These values were read from the saved project, not from a live connection test:

| Parameter | Saved value | Meaning |
| --- | --- | --- |
| `ApiBaseUrl` | `https://dietpi.tail4f2b8f.ts.net` | Server origin, including `https://` |
| `ApiPath` | `api/powerbi` | Shared reporting route, without leading/trailing slashes |

The queries combine these settings with an endpoint name. For example, the timesheet endpoint becomes:

```text
https://dietpi.tail4f2b8f.ts.net/api/powerbi/timesheets
```

### Steps

1. Open the project in Power BI Desktop.
2. On **Home**, open the arrow beside **Transform data** and select **Edit parameters**.
3. Change **ApiBaseUrl** to the new server origin, for example `https://reporting.example.com`.
4. Leave **ApiPath** as `api/powerbi` unless the server administrator has changed that route.
5. Select **OK**, then apply the changes if prompted.
6. If Power BI requests credentials for the new address, follow section 3.
7. Refresh the data and verify a familiar total before saving.

If **Edit parameters** is not visible, open **Transform data** to enter Power Query Editor, then use **Home → Manage Parameters**. Edit the parameter's **Current Value**, select **OK**, then **Close & Apply**. Microsoft documents this workflow in [Power Query parameters](https://learn.microsoft.com/en-us/power-query/power-query-query-parameters).

Enter only the origin in `ApiBaseUrl`: do not append `/api/powerbi/timesheets`, a login-page path, or a password. This project already adds the API path and endpoint. Changing the URL works only if the replacement server exposes the expected GCC reporting API and fields; an arbitrary website, Excel link or different API is not interchangeable.

For the saved Tailscale address, the refreshing computer needs access to the appropriate tailnet. Changing Power BI credentials will not fix a disconnected network or an unreachable server.

## 3. Change the saved password / API key

### Which password does this report need?

For the GCC reporting API, use:

| Authentication field | Value |
| --- | --- |
| Method | **Basic** |
| User name | `powerbi` |
| Password | The reporting API key supplied by your server administrator |

This is the API key configured as `POWERBI_API_KEY` on the GCC server. It is not your Windows password, Microsoft account password, or ordinary GCC application login password. The server also accepts an authorized administrator token, but tokens can expire; use the reporting key for the documented setup.

### Update credentials in Desktop

1. Select **File → Options and settings → Data source settings**.
2. Under **Data sources in current file**, select the Web source for your current server origin.
3. Select **Edit Permissions**.
4. In the credentials area, select **Edit** or **Edit credentials**.
5. Choose **Basic**, enter user name `powerbi`, and enter the new reporting key in the password field.
6. If a URL level is offered, use the intended server origin so its reporting endpoints use the same credentials.
7. Confirm, close the dialogs, and refresh the report.

If the entry is not available in the current-file list, inspect **Global permissions** for that exact source. If Power BI continues to reuse the wrong authentication method, clear permissions for **that source only**, then refresh and re-enter Basic credentials. Other reports using that source may also need to authenticate again. See [Microsoft's authentication instructions](https://learn.microsoft.com/en-us/power-query/connector-authentication).

The credentials dialog is for replacing credentials, not recovering a forgotten key. Obtain a replacement from the server administrator. Keep the actual key in the credential store, not in this Markdown guide, Power Query code, URL query strings, or Git.

### Changing the actual server-side key

Editing the password in Desktop does not rotate the server's key. If a rotation is needed, the server administrator must update `POWERBI_API_KEY` in the deployed environment or secret configuration and restart/redeploy the affected application so it reads the new value. Then update each Desktop connection and any Service/gateway connection that uses the old key. Editing `.env.example` only changes a template; it does not change a deployed server.

Changing the GCC application login password is a separate account-management task. Changing the Power BI/Microsoft sign-in password is also separate from the report's Web-source credentials.

## 4. Refresh and verify data

1. Check that the source server is reachable and the required network connection is active.
2. In Desktop, select **Home → Refresh → Data**. If your version has a single Refresh button, use **Home → Refresh**.
3. Wait for completion and inspect any errors.
4. Check **Last refreshed (IST)** in the report header. The model uses Indian Standard Time, UTC+05:30.
5. Check the month, division and fiscal-year slicers. Refreshing data does not automatically select a new reporting month.
6. Compare **Actual hours** with known submitted/approved entries in the GCC application. Draft and rejected entries are not included in that measure.
7. Save the project.

The report uses **Import mode**: visuals read the imported snapshot. Opening the report, changing a slicer, or refreshing a browser page does not itself fetch new source records. Import mode does not support **Automatic page refresh**, as explained in [Microsoft's refresh documentation](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-automatic-page-refresh). Use a semantic-model refresh to update the data.

## 5. Other editable parameters

Use the same **Edit parameters / Manage Parameters** workflow as section 2.

| Parameter | Saved value | How to use it |
| --- | --- | --- |
| `FiscalStartMonth` | `1` | January. Use `4` for April, for example; valid months are 1–12. Confirm the company's fiscal policy first. |
| `DailyHours` | `8` | Standard hours per weekday per employee. This affects capacity and utilization. Use the agreed positive working-day value. |
| `DefectTarget` | `0` | A ratio: enter `0.02` for 2%, not `2`. The current alert uses a fixed 0.05 absolute difference from this target. |
| `DeliverablesEndpoint` | Empty | Optional endpoint name under `ApiPath`, only when the administrator has supplied a compatible deliverables source. |
| `ImprovementsEndpoint` | Empty | Optional endpoint name under `ApiPath`, only when a compatible improvement register exists. |

Apply and refresh after changing these values. An empty optional endpoint is intentional; entering an invented endpoint name will not create the missing data. The current effort and schedule alert thresholds are separate hard-coded DAX values, not controlled by `DefectTarget`.

## 6. Change hour-category mappings

Unrecognized task categories become **Unmapped** and can leave utilization blank. This is a data-definition issue, not necessarily a password problem.

1. Open **Transform data**.
2. Locate the shared query **HourCategoryMap**.
3. Open **Advanced Editor** and keep a copy of its existing expression.
4. Add or revise a mapping only after the KPI owner confirms its meaning.
5. Use lowercase, trimmed source-category text. The source query normalizes the category this way before joining it to the map.
6. Keep one mapping per source category; duplicate keys can duplicate joined rows.
7. **Close & Apply**, refresh, and check unmapped hours and utilization.

Existing examples include `development → Productive`, `training → Training`, `trainings/webinars → Training`, `meeting → Internal`, and `leave → Vacation`. The model uses `Productive`, `Training`, `Internal`, `Admin`, `Vacation`, `Holiday`, and the fallback `Unmapped`. Do not assume every billable category is productive. Categories such as `SOP 1234` and `vgnn` need an agreed business classification before mapping them.

## 7. Edit charts, labels and filters

1. Select the report page and then the visual you want to edit.
2. Use **Format visual** for the title, colors, labels, border and other appearance settings.
3. Use **Build visual** and its field wells to change the metric or grouping. Drag the intended measure from `_Measures`; check that a replacement field does not change the aggregation or meaning.
4. Drag or resize the visual on the canvas. Keep labels readable and avoid overlap.
5. Check the **Filters** pane for visual, page and report filters. A slicer selection alone may not explain all filtering.
6. Test the visual with at least two divisions and a different month. Check totals as well as individual rows.
7. Save your changes.

For the management overview, keep KPI titles consistent with their measures. For example, **Actual hours by division** measures hours, not delivery performance. Training hours are included in actual hours, so do not add the two series together as independent totals.

For the phone version, select **View → Mobile layout**, choose the page, and adjust placement and formatting. Check it after desktop visual changes. See [Microsoft's mobile layout guide](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-create-mobile-optimized-report-mobile-layout-view).

## 8. Edit a DAX measure

1. In the Data pane, expand **_Measures**.
2. Select the existing measure and inspect its formula in the formula bar.
3. Copy the existing formula before editing it.
4. Edit and commit the formula, then check the result in the visuals that use it.
5. Check empty selections, zero values, individual divisions and overall totals. Preserve meaningful blanks instead of automatically converting them to zero.
6. Save only after checking the intended business result.

The prepared [DAX optimization review](documentation/DAX_OPTIMIZATION_REVIEW.md) contains recommendations. Its [comparison query](../scripts/compare-powerbi-dax-candidates.dax) defines temporary query-scoped measures for comparison; it does not apply changes to the production measures. Performance gains have not been benchmarked.

## 9. Power BI Service: credentials and scheduled refresh

These steps apply if you choose to publish the report. Desktop source credentials and Service connection credentials are configured separately.

1. Publish to the intended workspace using the organization's normal process.
2. Open the workspace in Power BI Service and locate the report's **semantic model**.
3. Open its **Settings**. Check **Parameters** for the source values where available.
4. Configure **Gateway and cloud connections** and the associated credentials. Depending on the connection type, credentials are managed under **Data source credentials** or the selected connection's settings.
5. For this GCC Web API, use the supported Basic connection with `powerbi` and the reporting key.
6. Run **Refresh now**, inspect **Refresh history**, and only then configure the permitted refresh schedule.

A private Tailscale-only address needs a refresh route that can reach that private network. Typically this means a gateway on an always-on machine with the required network access; Desktop working on your laptop does not prove the cloud service can reach the source. See [Microsoft's data refresh guidance](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-data).

After changing a server URL or key, update the relevant Service/gateway connection too. Refreshing imported data does not publish local layout or DAX edits. Republishing report/model changes and refreshing data are separate operations. Git commits or pushes also do not publish this report to Power BI Service.

## 10. Troubleshooting

| Symptom | Check / action |
| --- | --- |
| 401 / invalid credentials | Confirm the API key, Basic method, `powerbi` user name and correct source origin. Replace stale credentials. |
| 403 / access denied | Ask the administrator to verify reporting permissions or token scope. Ordinary employee credentials do not grant reporting access. |
| Cannot resolve host / timeout | Check the URL, Tailscale/network connectivity and server availability. |
| 404 / endpoint not found | Check `ApiPath`; make sure `ApiBaseUrl` does not already include the API path. Check optional endpoint names. |
| Expected a record containing a data list | The URL may return HTML/login content or an incompatible API response. Check the reporting endpoint with the administrator. |
| Pagination total changed | Source records changed during import; retry refresh. Persistent failures need API investigation. |
| Old month or unexpectedly low hours | Check slicers and all filter levels, then refresh. Actual hours exclude drafts/rejected entries. |
| Utilization is blank | Check hour-category mapping, available capacity and whether project/task filters make capacity unsupported. Open Input readiness. |
| Delivery/quality KPI is blank | Check delivered dates, target dates and required register inputs. No data and zero performance have different meanings. |
| Staffing KPI is blank | One or more selected divisions/months may lack staffing submissions. |
| Desktop refresh works; Service fails | Check Service/gateway credentials, network reachability, connection mapping and refresh history. |
| File edits do not appear in Desktop | Save pending Desktop work before external edits, then reopen the project to load them. Avoid saving an old open copy over newer file edits. |

## 11. Source files for advanced maintenance

Prefer Desktop for ordinary edits. If editing files directly, save and close Desktop first, use version control or a backup, and reopen the project afterward. Supported PBIR files can be edited externally; see [Microsoft's project report-folder documentation](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report).

| File or folder | Purpose |
| --- | --- |
| `GCC_Requirements/GCC_Requirements.SemanticModel/definition/expressions.tmdl` | Source parameters, shared API function and hour-category map |
| `GCC_Requirements/GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl` | DAX measures |
| `GCC_Requirements/GCC_Requirements.SemanticModel/definition/relationships.tmdl` | Model relationships |
| `GCC_Requirements/GCC_Requirements.Report/definition/pages/` | Report page and visual definitions |
| Each visual's `mobile.json` | Phone layout and formatting |
| [POWERBI.md](POWERBI.md) | Detailed model, query, measure and visual reference |

The project has no password parameter in `expressions.tmdl`. Adding a password there is not the credential-update workflow. Do not edit PBIX binaries or run the legacy scaffold builder to overwrite this maintained project.

After source-file changes, the existing tools can validate structure. From `C:\gcc_ts`, run:

```powershell
node scripts/validate-powerbi.js
python scripts/build-powerbi-mobile.py --check
```

These checks require the existing project dependencies and, for model loading, Power BI Desktop libraries. They check schemas, field references and phone placement; they do not prove that credentials work, values are correct, or all visuals render properly.

## 12. Final check after any change

- Confirm the correct project and source URL.
- Refresh successfully and inspect the IST timestamp.
- Check one known total and the selected month/division.
- Review blank KPIs and Input readiness.
- Check both desktop and phone layouts if visuals changed.
- Save, reopen and confirm the intended changes remain.
- Update the published report/connection separately if one is in use.

This document contains instructions only. Creating it did not change the source URL, credentials, API key or refresh configuration.
