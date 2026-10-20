# Power BI Troubleshooting Guide — GCC Timesheet App

> Dashboard Version: 2.2.1
> Last Updated: 2026-10-20

---

## Overview

This guide focuses on the most common issues encountered when connecting Power BI to the GCC Timesheet App reporting API and maintaining the dashboard.

---

## Incompatible linguistic metadata

In the affected GCC Dashboard checkout, Desktop reports that the file is incompatible, and **Copy details to clipboard** includes `NewerLinguisticSchemaVersion`. An earlier release-number update changed an internal schema declaration from `2.0.0` to `2.1.0` without changing its contents. Dashboard v2.2.1 restores that declaration and the separately versioned report format.

The preferred repair is to download/extract the complete **powerbi-v2.2.1** GitHub release into a new folder and open `powerbi/GCC_Dashboard/GCC_Dashboard_v2.2.1.pbip`. Keep its Report and SemanticModel sibling folders together. Configure the source URL and authorized credentials normally, then refresh data.

To repair this specific older source checkout manually:

1. Close Power BI Desktop and back up the project folder.
2. In `GCC_Dashboard.SemanticModel/definition/cultures/en-US.tmdl`, change only the linguistic JSON's `"Version": "2.1.0"` to `"Version": "2.0.0"`.
3. In `GCC_Dashboard.Report/definition/version.json`, restore the root `"version"` to `"2.0.0"`.
4. Reopen the `.pbip` in a fresh Desktop session. These are format versions, so keep them separate from the dashboard release number **2.2.1**. Leave the individual `$schema` URLs unchanged.

If an earlier failed opening leaves a `PackageSession` error, close that Desktop session and retry the corrected project from a fresh extraction. Do not save the failed session over the source. An incompatible file actually created by a newer Desktop version can require a Desktop update instead; do not downgrade unrelated projects' schema declarations based on this project-specific repair.

Local checks: `node --test scripts/powerbi-requirements.test.js` protects the supported format declarations, and `node scripts/validate-powerbi.js` checks report schemas and model bindings. See [v2.2.1 verification](../validation/RELEASE_2.2.1.md) for observed native results and remaining data prerequisites.

### Reinstalling Desktop

Back up your `.pbix` files and complete `.pbip` project folders first. Close Desktop, uninstall Power BI Desktop through Windows Settings, then reinstall the current 64-bit Desktop from the [Microsoft Store](https://aka.ms/pbidesktopstore) or [Microsoft Download Center](https://www.microsoft.com/download/details.aspx?id=58494). This machine was tested with the Store x64 edition. The Report Server edition is a separate product; use standard Desktop for this project. Microsoft no longer supports the 32-bit edition. See [Microsoft's installation guidance](https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-get-the-desktop).

Reopen the corrected v2.2.1 project after reinstalling. You may need to re-enter data-source credentials. Reinstalling the application does not replace the project source files containing the metadata declarations.

## Authentication Failures

### Symptom
- 401, 403, or unexpected access errors
- Query fails with API key problems

### Check
- Confirm the server has `POWERBI_API_KEY` configured
- Confirm the client sends the correct `X-API-Key` header or query parameter
- Confirm the server is not using a stale or expired credential
- Confirm the route is under the Power BI api namespace and not a non-reporting endpoint

### Fix
Use placeholders and secure configuration, not embedded credentials.

---

## API Errors and Empty Results

### Symptom
- 404, 429, 500 responses
- response is empty or malformed
- `data` property is missing

### Check
- Confirm the server is running
- Confirm the URL is correct
- Confirm the gateway or reverse proxy is forwarding the request correctly
- Confirm the response is JSON and contains the `data` array expected by the Power Query scripts

### Fix
Validate the service response before expanding it in Power Query. The scripts in [powerbi/legacy/queries](../legacy/queries) fail clearly instead of silently masking an API problem.

---

## Pagination Issues

### Symptom
- Only the first page of timesheet records is loaded
- totals appear to be lower than expected

### Check
- Confirm the API returns a `data` array and `pagination` object
- Confirm the pagination logic is configured to continue through all pages
- Check for page-size limits or API rate limiting

### Fix
Use the page/limit pattern from the backend and proceed through all available pages before combining results.

---

## Missing Data / Blank Dashboard

### Symptom
- visuals show no data even though employees or entries exist
- filter values appear valid but produce empty visuals

### Check
- Confirm the selected date range is valid
- Confirm the relationship direction is single and not ambiguous
- Confirm the date table is marked as the official date table
- Confirm no filter is overriding the fact table unexpectedly

### Fix
Use the Power BI no-data pattern: display a clear message instead of pretending the dataset is zero-valued.

---

## Relationship and Model Problems

### Symptom
- cross-filtering behaves unexpectedly
- totals change based on unrelated slicers
- duplicates or ambiguous relationship warnings appear

### Check
- Confirm the model uses a star schema
- Confirm `FactTimesheet` connects to `DimEmployee`, `DimProject`, `DimDivision`, `DimDepartment`, and `DimDate`
- Confirm `DimDate` is set as the date table
- Avoid unnecessary bidirectional relationships

### Fix
Keep the relationship pattern simple and single-direction.

---

## Date and Holiday Logic Problems

### Symptom
- weekend or holiday work is misclassified
- weekly totals are off by one week

### Check
- Confirm the week starts on Monday
- Confirm `IsWeekend` uses Saturday/Sunday
- Confirm holiday values are based on the `DimHoliday` date table
- Confirm `date` filters are using `YYYY-MM-DD`

### Fix
Use the DAX-based date table logic in [powerbi/legacy/queries/DimDate.dax](../legacy/queries/DimDate.dax).

---

## Refresh Problems

### Symptom
- refresh fails in Power BI Service
- scheduled refresh has credentials or gateway issues

### Check
- Confirm the API is reachable from the client/server environment
- Confirm the dataset credential is configured with the correct password
- Confirm gateway configuration is in place if the server is not public
- Confirm the data source is not blocked by network or TLS policy

### Fix
Use a documented gateway strategy and the correct Power BI Service dataset credentials.

---

## Gateway or Network Access Issues

### Symptom
- report works on local desktop but fails in Power BI Service

### Check
- confirm DNS, firewall, and reverse proxy settings
- verify HTTPS or network policy coverage
- verify endpoint reachability from the gateway machine

### Fix
Use an on-premises data gateway where required and document the deployment topology.

---

## Maintenance Guidance

When an issue appears:
1. Confirm whether the root cause is API, model, or visual-level
2. Check whether the backend contract still matches the Power BI query fields
3. Correct the root cause rather than masking it with DAX adjustments
4. Revalidate totals and the refresh path

---

## Escalation

Escalate to the reporting owner if:
- the API response contract changed without a documented version bump
- a dashboard refresh fails repeatedly despite correct credentials
- data quality issues suggest the server is returning incorrect reporting records
- a model change impacts core business KPIs or compliance reporting
