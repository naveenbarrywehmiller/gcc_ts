# Power BI Release Process — GCC Timesheet

> Dashboard Version: 2.0.0
> Last Updated: 2026-10-09

---

## Purpose

This document defines the controlled release process for the GCC Timesheet Power BI dashboard so that changes are versioned, documented, validated, and published without exposing credentials or breaking the production reporting model.

---

## Release Principles

1. The dashboard version is independent from the GCC Timesheet application version.
2. The Power BI report must remain compatible with the read-only API at `/api/powerbi/*`.
3. No credentials or secrets may be committed to source control.
4. Each release must include a changelog entry and compatibility notes.
5. Production deployment must be explicit and documented.

---

## Release Versioning

Use semantic versioning:

- MAJOR: breaking data model or API contract changes
- MINOR: new pages, new visuals, new measures, drill-through improvements
- PATCH: fixes, formatting, documentation, small corrections

Current baseline:
- Dashboard version: `v2.0.0`

---

## Release Workflow

### 1. Prepare the update
- Review the existing API and model contract
- Confirm the required changes are supported by the backend implementation
- Update the Power Query and DAX files if the model changes

### 2. Validate locally
- Check the API endpoints and sample payloads
- Test Power Query M scripts against the API responses
- Validate the date table and holiday logic
- Check DAX totals, percentages, and filter behavior

### 3. Update documentation
- Update [powerbi/CHANGELOG.md](../CHANGELOG.md)
- Update the relevant documentation under [powerbi/documentation](.)
- Confirm environment variable placeholders are used instead of real values

### 4. Review the release candidate
- Confirm the dashboard still follows the star schema
- Confirm no direct database access is implied
- Confirm the model does not rely on phantom field names

### 5. Publish the artifact
Use the most source-control-friendly format supported by the installed Power BI tooling.

Recommended practices:
- prefer PBIP-style project files when supported
- store binary artifacts separately from the code repo
- use GitHub Releases or approved internal distribution for packaged files
- never publish a report with embedded credentials

---

## Release Checklist

Before release, verify:
- [ ] API URL and key placeholders are documented
- [ ] No real secret values are committed
- [ ] Query scripts validate response schema and errors
- [ ] Date table and holiday logic are correct
- [ ] DAX totals reconcile with source data
- [ ] Drill-throughs and slicers still work
- [ ] The changelog reflects the release
- [ ] Deployment instructions are current

---

## Emergency Fixes

For urgent fixes:
1. Apply the smallest safe patch
2. Validate the direct downstream impact on the API and model
3. Update the changelog with a patch note
4. Publish only after confirming the fix does not introduce a silent schema break

---

## Post-Release

After publishing:
- confirm the dataset can refresh successfully
- confirm service credentials are still valid
- check the most important reports and KPIs
- update any deployment notes or support documentation as needed
