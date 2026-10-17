# Platform management and assignments

Implemented October 16, 2026 for application v1.29.0 and Power BI source package v2.2.0. Platform is the parent of Division. User Platform membership describes organizational assignments; it does **not** grant every Division or Project in that Platform.

## Workflows

- **Platform** appears immediately before **Division** in administration. System Admins create, rename and deactivate Platforms. Names are trimmed and unique without case sensitivity. A Platform with Division or User references cannot be deactivated.
- Every new Division requires an active Platform. Existing Division IDs and globally unique names remain intact. Managers retain their existing catalog-create/rename permission; only System Admins may move an existing Division to another Platform or deactivate it. Admins retain read-only catalog access.
- User Edit places Platforms before Divisions. Admin and Employee accounts support multiple Divisions, with one selected primary Division. Other roles retain their existing primary-Division semantics and can have multiple descriptive Platform assignments. Existing role permissions are unchanged.
- The shared picker supports search, Select filtered, Clear filtered, Show selected only, individual checkboxes and selected counts. Bulk changes affect only visible, editable results. Search changes preserve hidden selections. Removing a Platform prompts before removing its selected Divisions. Grants outside the editing Admin's scope are visible but disabled.
- Project Edit selects Platform before Division and displays each selectable user's Platforms and Divisions. **Existing division access** preserves the previous access model. **Selected users only** additionally restricts booking to explicitly selected users with an actual assignment to the Project Division. An empty selected-user list admits nobody. Switching Platform/Division clears the pending user selection, which is validated again on save.
- Existing Productive and Non-Productive task pickers use the same shared component. Read-only project views retain searchable task/user lists with disabled assignment checkboxes.

## Schema and migration

`server/src/config/platformMigration.js` runs from the existing migration flow in a transaction.

| Change | Purpose |
| --- | --- |
| `platforms` | Integer key, unique case-insensitive name, active flag and creation timestamp |
| `divisions.platform_id` | Mandatory parent Platform; indexed |
| `user_platforms(user_id, platform_id)` | Unique many-to-many membership, indexed by Platform; user deletion cascades |
| `project_users(project_id, user_id)` | Unique explicit project membership, indexed by user; entity deletion cascades |
| `projects.user_assignment_mode` | `division` by default, or `selected` |
| `users.platform_assignments_explicit` | Distinguishes migrated legacy defaults from deliberately saved grants |
| `platform_migrations` | One-time backfill marker; restarting does not restore revoked grants |

Existing Divisions receive **Legacy / Unmapped**, preserving Division, User, Project and Timesheet IDs and references. User memberships are backfilled from primary, Admin and Employee Division assignments. No historical time rows are rewritten or deleted. Existing Projects remain in `division` mode.

SQLite cannot add a non-null foreign-key column with a non-null default while foreign-key checks are enabled. Therefore Division-to-Platform integrity is enforced by insert/update triggers plus Platform delete/key-update restriction triggers. The new assignment tables use ordinary foreign keys and composite primary keys. The default Legacy Platform also keeps older internal SQL inserts compatible; the Division API requires an explicit valid Platform on creation.

Legacy Flex employees without explicit Division rows keep their previous division-access fallback until an assignment is saved. Saving assignments marks them explicit, preventing a cleared grant set from silently restoring all-division access. Removing grants removes invalid selected-project memberships in the same transaction. Historical timesheets remain available to authorized reporting users.

Platform attribution follows the current Division hierarchy. Moving a Division to another Platform reclassifies its historical reports; the edit form warns about this. It also adds the new Platform membership for affected users. Previous independent Platform memberships remain until explicitly removed. There is no dated organization-history/snapshot model.

## API contract

All application paths below are relative to `/api` and retain existing authentication and error envelopes. New invalid combinations return 400, unauthorized assignments return 403, and duplicate/referenced catalog operations return 409.

| Endpoint | Changes |
| --- | --- |
| `GET /platforms` | `{ platforms: [...] }`, active choices scoped to the caller's assignment permissions |
| `POST /platforms`, `PUT /platforms/:id` | `{ "name": "Engineering" }`; System Admin only; returns `{ platform }` |
| `DELETE /platforms/:id` | Deactivates an unreferenced Platform; System Admin only |
| `GET /divisions?platform_id=2` | Adds `platform_id`, `platform_name` and optional Platform filter |
| `POST /divisions` | Required `platform_id`; PUT accepts it for validated edits |
| `GET /users`, `GET /users/:id` | Adds `platforms`, `platform_ids`, `divisions`, `division_ids`; directory accepts `platform_id` |
| `POST /users`, `PUT /users/:id` | Accepts `platform_ids` alongside existing primary and multiple Division fields |
| `GET /users/:id/divisions` | Retains stored `divisions`; also returns effective `division_ids` and Platform memberships |
| `PUT /users/:id/divisions` | Existing System Admin endpoint for Admin grants accepts `platform_ids`; primary-Division fallback remains compatible |
| `GET /projects`, `GET /projects/:id` | Adds derived Platform fields, `user_assignment_mode`, `users`, `user_ids`; list accepts `platform_id` |
| `GET /projects/options` | Adds Platforms and user assignments, including `assignable_division_ids` for actual project-eligible Division grants |
| `POST /projects`, `PUT /projects/:id` | Accepts `user_assignment_mode`, `user_ids`, and optional consistency-checked `platform_id` |
| Reports options/analysis/entries/export | Platform choices, attributes and comma-separated `platform_ids`; singular `platform_id` alias supported |

Create a Division:

```json
{ "name": "Product Design", "platform_id": 2 }
```

Update an Employee or Admin (IDs must exist and be permitted):

```json
{
  "division_id": 10,
  "division_ids": [10, 11, 20],
  "platform_ids": [2, 3]
}
```

An abbreviated response is:

```json
{
  "user": {
    "id": 42,
    "division_id": 10,
    "division_ids": [10, 11, 20],
    "platform_ids": [2, 3],
    "platforms": [{ "id": 2, "name": "Engineering", "active": 1 }, { "id": 3, "name": "Operations", "active": 1 }],
    "divisions": [{ "id": 10, "name": "Product Design", "platform_id": 2, "platform_name": "Engineering" }]
  }
}
```

The example's `divisions` array is shortened; actual responses include all effective assignments. Duplicate submitted IDs are deduplicated. If an older client omits `platform_ids`, the backend derives the required Platforms from its validated Division selection. It never derives Division grants from Platforms.

Restrict a Project to selected users:

```json
{
  "platform_id": 2,
  "division_id": 10,
  "user_assignment_mode": "selected",
  "user_ids": [42]
}
```

Normal project fields and task assignments remain required on creation. Existing project import/export columns remain in their original positions; export appends derived Platform. Imports continue to resolve the actual Division and derive its Platform rather than creating duplicate Divisions.

## Authorization

The backend validates all selected IDs and Division-to-Platform pairs, including direct API requests. Admins cannot add grants outside their assigned Divisions, remove existing out-of-scope Division grants, or change their own administrator access. System Admins remain the only role that changes administrator grants or Platform catalogs. Managers/Viewers retain their established companywide business-directory/report reads; this is not permission to book time or change assignments.

Selected-project restrictions are checked in project visibility and timesheet creation/update/submission paths. Platform-only membership cannot qualify a selected Project user. Reports and Power BI Admin sessions intersect their existing employee/project scope with effective entry-Division scope. Dedicated reporting API keys retain their existing companywide service-account access; a report slicer is not an authorization boundary.

## Reports, Excel, PDF and CSV

The canonical attribution is:

`Timesheet Division → Project Division fallback → User primary Division fallback → Platform`

Historical rows with no resolved Division show **Unmapped**. Migrated Divisions show **Legacy / Unmapped** until reclassified. Fact queries join one Division and one Platform per time row; they never join assignment bridges to multiply hours.

Reports accept, for example:

```text
/api/reports/analysis?start_date=2026-10-01&end_date=2026-10-16&platform_ids=2,3
/api/reports/entries?start_date=2026-10-01&end_date=2026-10-16&platform_ids=2,3&division_id=10
/api/reports/export?start_date=2026-10-01&end_date=2026-10-16&platform_ids=2,3&view=projects&format=excel
```

Platform and Division filters intersect. Weekly/Utilization rows show contributing Platforms; their Division label remains the employee's primary Division. Project Hours shows contributing Platform/Division labels, including historical entries without a Project. Missing Hours identifies the employee's primary Platform. Trends aggregates the selected Platforms by period; entry details preserve row-level attribution.

Excel and PDF use the same report service and filters as the UI. All relevant tables and the Excel Timesheet Entries sheet include Platform; detailed exports include effective Division. Existing totals, status, billing and planning data remain present. Whole-person capacity, utilization percentages and missing-hour targets are unavailable under Platform/Division filters because no per-Division capacity allocation exists. Clear those filters to see whole-person capacity; do not compare partial organizational hours to a full roster denominator.

The existing offline `scripts/export-to-sharepoint-csv.js` includes a Platform catalog plus Platform fields in Division, Subdivision, Employee, Project and approved Timesheet CSVs. Employee CSVs also include `AssignedPlatforms` and `AssignedDivisions`. It remains an operator export of the whole local database, not a scoped HTTP download. It uses the migrated schema and can write to `GCC_CSV_EXPORT_DIR` for isolated validation. Configure corresponding destination columns before importing these CSVs; this change does not provision or publish SharePoint lists. The web reporting page retains its existing Excel/PDF formats.

## Power BI

The standalone `powerbi/` deployment structure is preserved. The canonical `GCC_Requirements` PBIP, legacy TMDL/BIM model and reference Power Query sources include DimPlatform and Division Platform keys. Each of the eight canonical report pages has a Platform slicer immediately before Division, including an adjusted mobile layout.

`DimPlatform[id] → DimDivision[platformId] → FactTimesheet[divisionId]` uses single-direction one-to-many filtering. Existing Division-aware measures inherit the Platform filter. Staffing follows DimDivision; project/employee-derived measures retain their established Division filtering. User assignment bridges are deliberately absent from the fact model. Platform-filtered roster capacity is blank because allocation is undefined.

The read-only API adds `/api/powerbi/platforms` and scalar `platformId`/`platform` to time, Division, Project, assignment, staffing and vacation feeds. User feeds expose assignment arrays. Time and status-summary Division filters use the effective entry Division. Platform filters are supported on organizational feeds, timesheets, users, projects, status-summary and legacy export. Global reference feeds such as holidays/tasks remain global. For example:

```text
/api/powerbi/timesheets?from=2026-10-01&to=2026-10-16&platform_ids=2,3
/api/powerbi/status-summary?platform_ids=2
/api/powerbi/platforms
```

Platform dimension response: `{ "data": [{ "id": 2, "platformName": "Engineering", "isActive": 1 }] }`. Timesheet rows retain existing fields and add `{ "divisionId": 10, "platformId": 2, "platform": "Engineering" }`. `divisionId` now resolves the same fallback as the displayed Division, including historical null entry-Division rows. API version remains 2.0.0, consistent with its additive-contract policy. Deploy this application revision before refreshing the updated PBIP: the PBIP now requires `/platforms` and the new columns.

Authentication, cache TTL, refresh clock, manual-refresh help/buttons and existing scheduled-refresh deployment procedure are retained. The service can return cached results for its configured TTL after organizational edits.

## Files and components

| Area | Main files |
| --- | --- |
| Schema and routes | `server/src/config/{migrate,platformMigration}.js`, `server/src/index.js`, `server/src/routes/{platforms,divisions,users,projects,timesheets,powerbi}.js` |
| Validation/access | `server/src/utils/{platformAssignments,projectFields,timesheetValidation}.js`, `server/src/repositories/TimesheetRepository.js` |
| Reporting/exports | `server/src/services/{reporting,reportExport,powerBiService}.js`, `scripts/export-to-sharepoint-csv.js` |
| UI | `client/src/components/ui/MultiSelectPicker.jsx`, `ProjectTaskPicker.jsx`, `layout/Sidebar.jsx`, `client/src/App.jsx`, `client/src/pages/admin/{SimpleListManager,Users,Projects}.jsx`, `client/src/pages/Reports.jsx` |
| Power BI | `powerbi/GCC_Requirements/` model and eight page definitions, `powerbi/GCC_Timesheet_Model/`, `powerbi/GCC_Timesheet_Model.bim`, `powerbi/queries/{Platforms,Divisions,Projects,Timesheets}.pq` |
| Tests/evidence | `scripts/platforms.test.js`, `scripts/permission-matrix.test.js`, `scripts/powerbi-requirements.test.js`, `scripts/powerbi-fixture.json`, `scripts/test-powerbi-model.ps1`, `powerbi/validation/schema-validation.json`, `docs/RESPONSIVE_AUDIT.md` |

## Verification and rollout

- Automated tests use isolated databases. New coverage includes migration from a pre-Platform schema, rerun safety, required associations, duplicate IDs/names, multi-Platform persistence, unauthorized manipulation, selected Project users, grant revocation, historical projectless time, report/API reconciliation and filtered Excel/PDF/CSV contents.
- Full suite: 128 Node tests and 55 Power BI API checks pass. Lint, production build and `git diff --check` pass. Vite retains its existing large-chunk warning.
- Headed Chromium: 436 viewport checks pass with no API/browser exceptions. The main 13 page/dialog states cover all 21 required sizes and seven extra landscape sizes. Admin/Manager pages and assignment/read-only dialogs have additional coverage. Search, filtered bulk changes, hidden-selection preservation, removal confirmation, save/reload and task-picker behavior were exercised. Representative screenshots were visually inspected.
- Six PDF report views were generated and rendered with Poppler, including continued Missing Hours and Project planning/contributor pages. Platform columns, wrapping, totals and page boundaries were visually inspected. Excel and CSV contents were checked programmatically.
- Power BI validator passes all 254 documents, including native TOM/TMDL deserialization and report schema validation. Native DAX/refresh assertions for Platform totals were added to `scripts/test-powerbi-model.ps1`, but **were not executed**: no Analysis Services model was running. This is source validation and API reconciliation, not proof of a successful Desktop/Service refresh or visual rendering in Power BI.

Before production rollout, take the normal SQLite backup, deploy the server/client together, and allow the startup migration to run. Review **Legacy / Unmapped** Divisions and explicitly assign real Platforms; no business mapping is guessed. Open the updated PBIP in Power BI Desktop, refresh against the deployed API, compare hours by Platform/Division for identical dates/statuses, and publish through the existing release process. Run the isolated native DAX test against an available local engine before release. No production database migration, remote deployment, live refresh or publication was performed during implementation. Firefox/Safari, physical devices and production-scale performance were not tested.
