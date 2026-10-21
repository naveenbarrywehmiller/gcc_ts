# Responsive design audit

For future layout tests, use the reusable [Chromium responsive and loading-state checklist](CHROMIUM_LAYOUT_TEST_CHECKLIST.md), including the full 28-viewport list and the route-loading validation baseline.

## Project and task activity indicators (October 20, 2026)

Projects and Task Name/Number now show a small filled green marker for active records and a hollow gray marker for inactive records. The same markers appear beside assigned tasks in Projects. Both pages include a legend; each record marker has an accessible status name and a tooltip. Project activity remains separate from Inprogress/Hold/Completed workflow status. Labels keep the marker beside the first text line, project codes stay on one line, and task names retain normal word wrapping.

Headed Chromium against the production build with synthetic intercepted API responses passed **124 responsive checks**: mixed active/inactive lists on both pages in light and dark themes at all 28 checklist viewports (112), Manager and Viewer lists at mobile/laptop sizes (8), and empty System Admin lists at mobile/laptop sizes (4). Checks covered document overflow, contained horizontal table scrolling, the shared header, marker dimensions, tooltip/accessibility names, filled versus hollow appearance, and marker/text alignment. Fifteen functional checks covered active/inactive/all filters in both themes, independent project/task activity, workflow status, and keyboard navigation without extra marker focus stops. No browser exceptions, console errors or unexpected API requests occurred.

Twenty screenshots were captured at the five representative sizes for both pages and themes. Screenshots at all five sizes were inspected, with additional dark-theme samples. Initial review found markers wrapping above project codes and excessive task-name word breaking; both were corrected before the final run. Evidence and the temporary Playwright script are in the machine's temporary directory (`gcc-activity-indicators-evidence` and `playwright-test-activity.js`). Production build, lint and whitespace checks on the changed frontend files pass. The local code map was rebuilt.

Coverage limits: API responses were intercepted; live records, backend mutations, forced loading/error states, Admin-role coverage, other browser engines, physical devices and assistive technology were not exercised. No routing, permissions or loading behavior changed.

## Power BI 2.2.1 phone spacing repair (October 20, 2026)

The seven native phone pages with Platform/Division overlap now move Division and every following visual down 24 units. Dropdown heights are retained, with eight units of space after Platform. All 121 saved phone placements pass the geometry checker; all 121 desktop bounds and positions are unchanged and pass their existing geometry check. The web UI was not edited, so the 140 live Chromium checks recorded below remain applicable to its unchanged layout. Native phone drawing, full Desktop canvas rendering, physical devices and Power BI Service preview remain unverified; see [release verification](../powerbi/validation/RELEASE_2.2.1.md).

## Live reporting and Power BI verification (October 20, 2026)

The live application's five populated report views were tested as System Admin in Chromium, light theme, at all 28 checklist sizes: **140 checks**. No document-level horizontal overflow, missing headers, browser exceptions or unexpected API failures occurred. Status/period/Platform filters and reset, an empty approved-status result, drilldown opening/Escape, project expansion/collapse, monthly trend grouping, and a mobile drilldown's viewport bounds passed. Weekly Summary Excel and PDF downloads completed; the Excel workbook's total/pending/approved hours matched the screen and API. Screenshots were captured at five representative sizes per view; mobile Weekly Summary, tablet Utilization, laptop Project Hours, desktop Trends and ultrawide Missing Hours screenshots were inspected.

Separately, saved Power BI report geometry covers nine pages and 121 visuals. Desktop bounds and overlap checks passed, but native phone layouts have seven Platform/Division filter overlaps. Native page rendering remains unverified due Desktop opening/session errors. See [the full Power BI test report](../powerbi/validation/TEST_REPORT_2026-10-20.md) and its linked evidence. Browser screenshots/downloads remain in the machine's temporary `gcc-powerbi-web-evidence` directory.

No frontend layout was changed. This live run did not cover other roles/themes, forced loading/error states, other browser engines, physical devices or assistive technologies. `npm test` passed 153 Node tests and 55 reporting API checks. Build/lint were not rerun for the one-line PowerShell synthetic-fixture repair and evidence-only changes.

## Route code splitting (October 19, 2026)

Admin screens, Matrix help, manager approvals and Reports now load through dynamic imports when opened. The loading status appears inside the existing responsive shell, preserving navigation and the content container. All route paths, page props, redirects and permission guards are unchanged; the four named catalog screens share one deferred module.

The production build reduces the main JavaScript chunk from 637.48 kB to 384.04 kB (about 40%). Including the shared API chunk, initial JavaScript is 441.19 kB (about 31% less). Vite emits the route chunks automatically with the existing configuration, and no chunk exceeds the unchanged 500 kB warning threshold. Lint, whitespace checks and 48 focused permission, Admin access, Viewer and reporting tests pass.

Headed Chromium against production assets and the actual API with an isolated in-memory database passed 114 direct-link checks: all 19 affected URLs for all five roles and signed-out users. Denied routes redirect without requesting their deferred chunks. Home requests no admin/report screen chunks; client navigation, browser Back/Forward and the legacy Locations redirect work.

All 18 deferred screens passed document-overflow and shell checks at the 21 required viewport sizes plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024 (504 checks). Holding the Reports chunk passed 28 additional loading-state checks for document width, visible shell and status bounds; the mobile navigation opened and closed with Escape while loading. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were visually inspected. No browser exceptions or unexpected API failures occurred. Other browser engines, physical devices and screen readers were not tested.

## Timestamped catalog downloads (October 17, 2026)

Project and task Excel filenames include `YYYY-MM-DD_HH-mm-ss` using the browser's local time zone; direct API calls default to UTC. The download helper uses the API's Content-Disposition filename. Rendered components and styles are unchanged. Headed Chromium passed both page/export-button checks at all 28 required sizes/orientations and two additional page checks in an India time zone (58 checks). Actual download names matched Los Angeles and India local times; timestamped files reimported successfully. Direct API UTC filenames and rejection of invalid time zones were checked. The 13 import/export tests, lint, production build and whitespace checks passed; the existing Vite large-chunk warning remains.

## Project and task workbook editing (October 17, 2026)

Projects removes Download Template and uses Export Projects for populated or header-only workbooks. Projects and Task Name/Number support stable-ID updates, Excel single-choice dropdowns, whole-file validation with row errors, and deactivation of removed export rows. Project exports/imports retain Admin Platform/Division scope; tasks retain shared companywide permissions. Project task/user assignments and timesheet links survive updates. See [CATALOG_IMPORT_EXPORT.md](CATALOG_IMPORT_EXPORT.md) for file rules and compatibility.

Headed Chromium with the actual application/API and an isolated in-memory database passed **288 responsive checks**. Ten states (Project list, editor, long import-error dialog and empty list; Task list, editor, long import-error dialog and empty list; Help; Matrix help) passed all 21 required sizes plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024. Manager and Viewer project/task pages additionally passed mobile and laptop checks with export available and import hidden. Checks covered document overflow, transfer-button bounds/touch targets, dialog bounds and dialog horizontal overflow. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were inspected. Long error lists scroll locally and Escape closes dialogs. No browser exceptions were observed.

Browser functional checks covered scoped Admin exports, actual downloaded workbooks, successful project/task edits and reuploads, row-error popups and header-only empty project exports. All **145 Node tests and 55 reporting API checks**, lint, production build and whitespace checks passed. New tests cover filtered/fully removed rows, records created after export, atomic failures, permissions, duplicate/unknown IDs, modified metadata/identity headers, inactive assignments, history, reactivation and legacy files. Excel validation rules and named ranges were verified by reading the saved XLSX files; interaction inside desktop Excel was not tested. Other browser engines, physical devices and production data were not exercised. Vite retains the existing large-chunk warning.

## Clean setup, productive classifications and Linux administration (October 17, 2026)

Fresh setup creates only the initial System Admin. Sample users and all business catalogs are omitted; upgrades preserve existing data until an explicitly confirmed factory reset. Local test data was reset with a required native database safety backup. The Ubuntu menu adds default-enabled reboot startup (32), factory reset with warning and mandatory full snapshot/recovery (33), absolute backup paths, and persistent web maintenance for manual/scheduled backups, restore and reset. Maintenance release remains restricted to a System Admin in the browser and is blocked during database operations.

Productive and Non-Productive replace the previous task classifications in stored task values, project task groups, timesheets, Dashboard, report filters/totals, Excel/PDF headings, Help and local Power BI measure labels. Startup migrates existing classifications while preserving record IDs, foreign keys, triggers, indexes and assignment history. Integration field names remain compatible, and older project spreadsheet task-ID headings remain accepted. Searchable timesheet options now wrap long labels, preserving the full classification on narrow screens.

Headed Chromium with the actual API and an isolated in-memory database passed **448 viewport checks**: 13 page/dialog states at all 21 required sizes plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024; three additional states checked scrolled project task pickers, open timesheet task choices and the maintenance page at the same 28 sizes. Checks covered document overflow, dialog bounds/overflow and untruncated task classification labels. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were inspected. System Admin browser login successfully released maintenance. The only expected API failures were unauthenticated session/refresh checks before login; no browser exceptions or unexpected API failures were observed. Other browser engines and physical devices were not tested.

Validation passed 132 Node tests, 55 reporting API checks, 23 deployment unit tests, lint, production build, whitespace checks and structural validation of 254 Power BI documents. A subsequent focused import suite passed all six tests after legacy-header compatibility was added. Vite retains the existing large-chunk warning. Tests now use isolated maintenance files so a local installation's real maintenance state is preserved. New failure cases cover mandatory backup/confirmation, restore safety copies, reset recovery, stale-session ID isolation, maintenance release locks, empty catalogs and legacy classification migration. Local Power BI source checks passed; live refresh/DAX execution was not tested. The broader optional heuristic review was stopped after its local source scans; its generated governance artifacts are not part of the change.

The Ubuntu/Docker CI smoke test now builds this source revision and exercises restart-policy changes, maintenance release, backup/restore and factory reset. It was updated but could not be executed on this Windows host; an actual Linux reboot remains to be verified. Administrator 1.1.0 distribution assets and the generated source reference are built locally; no release, image publication or remote deployment was performed.


## Platform management and assignments (October 16, 2026)

Platform precedes Division in navigation and the Division, User and Project forms. A shared searchable checkbox picker now serves Platform, Division, Project user and existing task assignments. Reports include multi-Platform filtering and relevant Platform columns. See [PLATFORM_MANAGEMENT.md](PLATFORM_MANAGEMENT.md) for schema, API contracts, permissions, attribution and deployment details.

Headed Chromium against the actual application/API with a synthetic in-memory database passed **436 viewport checks** with zero API/browser exceptions. Thirteen main states (Platform list/create, Division list/create, User list/edit, Project list/edit and five report tabs) passed all 21 required sizes plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024. Admin and Manager directory pages passed mobile/laptop checks; the scoped Admin user dialog and Manager read-only project dialog passed all 28 sizes. Checks covered document overflow, dialog bounds and dialog overflow. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were inspected. Long forms and choice lists scroll locally; wide tables keep local horizontal scrolling.

Functional browser checks covered Platform/Division creation, saved multiple Platform/Division assignments, search, Select filtered, Clear filtered preserving hidden selections, selected-only mode, cancel/accept Platform-removal confirmation, user/project save and reload, selected-project user display, disabled out-of-scope grants, read-only task selection and multi-Platform reports. The existing task picker retained selection behavior after adopting the shared component. Screenshots were captured after allowing responsive navigation to settle; intermediate sidebar transition frames were excluded from overflow checks.

Six PDF views were rendered with Poppler and visually inspected, including multi-page Project Hours and Missing Hours. Detailed exports include both Platform and effective Division. Automated tests check filtered Excel, PDF and offline CSV data. The full suite passes 128 Node tests and 55 Power BI API checks; lint, build and whitespace checks pass. Vite retains its large-chunk warning. Power BI validation passes 254 documents and native TOM/TMDL deserialization; live refresh and DAX execution remain unverified because no model engine was running. No production data or external publication was used. Other browser engines, physical devices and production-scale load were not tested.

## Task planning and project assignments (October 13, 2026)

Task Name/Number adds five optional planning fields and columns. Projects replaces the single Billing Type with separate searchable Billable and Non-Billable checkbox lists, selected counts, bulk filtered selection and a selected-only view. At least one task is required across the categories. Timesheet choices use explicit assignments and show the selected task's planning values. Project tables, Dashboard, Project Hours, Excel/PDF exports, Help and Matrix help reflect the new behavior. See [TASK_PLANNING.md](TASK_PLANNING.md) for migration, calculation and import details.

Headed Chromium against the actual API with an isolated in-memory database passed 280 page/dialog viewport checks: task table/form, project table/form, Dashboard, Project Hours, timesheet task dialog, Help, Matrix help and Manager read-only project dialog at all 21 required sizes plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024. Checks covered document overflow, dialog bounds and dialog width; the read-only form additionally checked input bounds at every size. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were inspected, including the assignment controls scrolled into view. Wide tables retain local horizontal scrolling, and long forms/lists scroll inside their dialogs.

Functional browser checks used more than 120 synthetic tasks: create/edit and persistence of optional fields, rejection of empty assignments, search/no-results behavior, selections retained across filters, mixed-category project save/reload, assignment-filtered timesheet options and planning display. Manager assignment checkboxes remained disabled while searches stayed available. Escape closed dialogs. No browser exceptions or responsive regressions were found. Other browser engines, physical devices and live production data were not exercised.

The Project Hours PDF planning section was generated with 28 tasks, rendered using Poppler and visually checked across its four-page report, including the continued planning table. Blank estimates and dates remain blank; headers and page numbers stay readable. All 118 Node tests and 55 Power BI API checks, lint, production build and `git diff --check` passed. Vite retains its existing large-chunk warning. Power BI Desktop runtime validation was unavailable because Windows denied access to the installed Microsoft Store Tabular library; local model/query source updates were not published or refreshed live.

## Reports Last Week preset (October 12, 2026)

Last Week appears immediately after This Week and selects the previous Monday–Sunday with local calendar-date arithmetic. Existing report filters remain selected and apply to all views, entry details and downloads.

Headed Chromium against the actual API with an isolated in-memory database passed all 21 required sizes plus the six landscape sizes below (27 sizes) for the updated Reports preset controls. Checks covered document overflow, button clipping/overlap, keyboard focus, button order, selected state, the October 5–11 range for October 12, retained division/employee filters, all five report tabs and the date/filter parameters of Excel/PDF downloads. Manager, Admin and System Admin views also passed mobile and laptop checks. Representative mobile, tablet, laptop and ultrawide screenshots were inspected. No API errors or browser exceptions occurred; only synthetic data was used. Firefox, Safari and physical devices were not tested.

All 18 reporting tests, lint, production build and `git diff --check` passed. Date cases cover Monday and Sunday, rollover to the next week, year boundaries, leap-day weeks and a daylight-saving boundary week. Vite retains the existing JavaScript chunk warning.

## Viewer role and user registration counts (October 12, 2026)

Viewer has companywide read access to business pages, with existing filters and report Excel/PDF downloads. Personal timesheet navigation and routes are unavailable; project details, approval details, team vacation, shared settings and monthly records expose read controls only. Users adds six registration cards: total plus all five roles. Counts include active and inactive accounts, exclude anonymized deleted accounts and stay companywide when filters are selected. Selecting a role card filters the directory. Only System Admins can assign Viewer.

Headless Chromium with the actual API and an isolated in-memory database passed 486 page/dialog viewport checks: 17 Viewer pages and the read-only project dialog at the same 21 required sizes and six landscape sizes listed below (27 sizes). The System Admin user form with Viewer selected passed bounds and overflow checks at all 27 sizes. Manager, Admin and System Admin user-count layouts also passed mobile and laptop checks. Checks covered document overflow, role-card overlap, read-only fields and controls, mobile navigation, companywide selections, report Excel/PDF downloads, role-card/user filters, project/task filters, approval search/details, vacation employee/date filters, division/month selections, settings search, audit search, matrix filtering and the direct-timesheet redirect.

Representative mobile, tablet, laptop and ultrawide screenshots were visually inspected. All 17 Viewer pages also passed a final API/browser-error and read-only-request check. Browser fixtures and migration tests do not use production data. Firefox, Safari and physical devices were not tested.

`npm test` passed 112 Node tests and 55 Power BI checks. Coverage includes Viewer authentication and SSO, password changes, all five filtered report download views, direct API mutation rejection, counts independent of filters, historical time after a role changes to Viewer, exclusion from capacity and missing-hours targets, and preservation of user IDs, foreign-key links, columns, indexes, triggers and sequences during migration. `npm run lint`, `npm run build` and `git diff --check` passed. Vite retains the existing JavaScript chunk warning.

## Manager companywide read access (October 12, 2026)

Managers can browse Users, Projects and Task Name/Number across all divisions and read companywide reports, entry details and exports. Directory navigation and page guards use separate view permissions; account, project and task mutation controls are hidden for Managers. Project details use the existing read-only dialog. The task directory adds active/inactive/all filtering. Matrix help and Manager Help describe the resulting access. Dashboard team summaries, approvals, team vacation and monthly division records retain their assigned-division scope.

Headless Chromium against the actual local API with an isolated in-memory database passed 162 page/viewport checks: Users, Projects, Tasks, Reports, Matrix help and Help at all 21 required sizes, plus 568×320, 667×375, 844×390, 1024×768, 1180×820 and 1366×1024 (27 sizes). Every size also passed read-only project dialog bounds, disabled fields and Escape close checks. Checks covered document overflow, populated records from two divisions, Manager navigation, hidden mutation controls and the shared task status filter. Representative mobile, laptop and ultrawide screenshots were visually inspected.

Functional checks covered user division filtering, foreign-division report entry details, project Excel downloads, report Excel/PDF downloads, Manager access without a profile division, Admin and System Admin management controls, Admin report scope, and Employee route/sidebar restrictions. The Users view was rechecked at all 27 sizes after restricting the self-post hint to authorized roles. There were no browser exceptions or API errors. Browser actions only read isolated fixtures; production data and credentials were not used. Firefox, Safari and physical devices were not tested.

`npm test` passed 103 Node tests and 55 Power BI checks. The permission tests verify companywide Manager reads and 403 responses for account, project and task mutations, while preserving Admin report scope and existing team/approval rules. `npm run lint`, `npm run build` and `git diff --check` passed. Vite retains the existing JavaScript chunk warning.

Date: October 7, 2026

## Application map

The frontend uses React 19, React Router, Vite 8, and Tailwind CSS 3. The shared shell contains a fixed sidebar, sticky header, content area, and footer. Dashboard cards and CSS bars, a weekly timesheet table, a scrollable vacation calendar, report tables, administration tables and forms, searchable selects, and shared modals make up the principal responsive surfaces. Tailwind's existing `sm`, `md`, `lg`, and `xl` breakpoints were retained. The app has no chart canvas or video element in the active views.

## Responsive issues found and fixed

| Component | Problem and cause | Fix |
| --- | --- | --- |
| Shell and navigation | The fixed 68px sidebar stayed visible on phones, reducing content width and exposing only icons. | Added an accessible mobile drawer with backdrop, Escape and Tab handling, focus restoration, and 44px links. Desktop collapse behavior remains available. |
| Reports | Preset and tab rows had unbroken flex content. At 320px, the document measured 538px wide against a 314px client width. | Wrapped presets, dates, and tabs within their available width. Tables retain local horizontal scrolling. |
| Timesheet | The week switcher used a 260px minimum label width. Its calendar picker could open outside the left edge or below a short landscape viewport. | Made the switcher fluid, anchored the picker to the header, and constrained picker height with internal scrolling. |
| Planned Vacation | A 200px minimum week label plus arrow buttons pushed the controls beyond narrow screens. | Let the label shrink and wrap. The seven day calendar keeps its own horizontal scroll so day content remains readable. |
| Modals and forms | Shared dialogs used 85vh, wide mobile padding, and no focus containment. Some form grids forced two columns on phones. | Constrained dialogs to the dynamic viewport, scrolled the body, wrapped footer actions, trapped and restored focus, and stacked affected forms at small widths. |
| Approval cards | Names and email addresses were squeezed to one or two characters per line by neighboring actions. | Reflowed manager and admin approval content into readable mobile rows and wrapped long text. |
| Admin controls | Several filters and action rows used fixed widths or hover only visibility. | Wrapped filters and headers, made actions visible on touch and focus, and kept tables inside scroll containers. |
| Inputs and tooltips | Several important controls lacked accessible names; small mobile input text could trigger browser zoom. Help tooltips could extend beyond a phone viewport. | Added labels, accessible names, mobile sized input text and controls, and viewport contained mobile tooltips. |
| Large monitors | Content expanded with the entire available width. | Centered primary content in a 1600px maximum width container. |

## Files modified

```text
client/src/components/layout/Header.jsx
client/src/components/layout/Layout.jsx
client/src/components/layout/Sidebar.jsx
client/src/components/ui/FieldHelp.jsx
client/src/components/ui/Modal.jsx
client/src/components/ui/SearchableSelect.jsx
client/src/index.css
client/src/pages/Dashboard.jsx
client/src/pages/Login.jsx
client/src/pages/PlannedVacation.jsx
client/src/pages/Reports.jsx
client/src/pages/Timesheet.jsx
client/src/pages/admin/AdminDepartments.jsx
client/src/pages/admin/Approvals.jsx
client/src/pages/admin/AuditLog.jsx
client/src/pages/admin/DivisionUpdates.jsx
client/src/pages/admin/Holidays.jsx
client/src/pages/admin/SimpleListManager.jsx
client/src/pages/admin/Subdivisions.jsx
client/src/pages/admin/SystemMaintenance.jsx
client/src/pages/admin/Tasks.jsx
client/src/pages/admin/Users.jsx
client/src/pages/manager/ManagerApprovals.jsx
docs/RESPONSIVE_AUDIT.md
```

## Improvements by screen size

- **Mobile:** full content width, drawer navigation, wrapped controls, readable approval cards, stacked forms, scrollable tables and calendar, usable dialogs and tooltips.
- **Tablet:** sidebar and content have predictable widths; filters, buttons, and cards reflow without document scrolling.
- **Laptop:** existing density and navigation are preserved while long content remains contained.
- **Desktop:** cards and tables retain the existing visual design, with less risk of oversized controls.
- **Ultrawide:** content stays centered and readable within a 1600px maximum width.

## Validation

The main matrix used Playwright with read only API fixtures and a system admin persona. At every listed viewport, it loaded Login, Dashboard, Timesheet, Planned Vacation, Reports, and Users. It checked document width, route rendering, sidebar or mobile drawer operation, calendar picker bounds, local table scrolling, and Create User dialog bounds and Escape close. “Forms” means that dialog and its controls fit; form submission was not performed. Representative mobile views were also inspected visually. All listed matrix checks passed with no page errors.

| Viewport | Layout | Overflow | Navigation | Forms | Tables | Modal | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 360×640 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 375×667 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 390×844 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 393×852 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 414×896 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 430×932 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 568×320 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 640×360 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 844×390 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 932×430 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 600×800 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 768×1024 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 810×1080 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 820×1180 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 834×1194 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1024×1366 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 800×600 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1024×768 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1366×1024 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1280×720 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1366×768 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1440×900 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1536×864 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1600×900 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 1920×1080 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 2560×1440 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 3440×1440 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| 3840×2160 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

Fifteen additional administration and manager routes rendered without document width overflow or page errors at 320×568, 390×844, 768×1024, 1366×768, and 3440×1440. Populated approval cards were visually inspected at 320×568. The mobile drawer was opened and closed by touch and keyboard; the user form retained focus while typing; its footer remained visible at 568×320; report tabs and filters responded; Timesheet's project dialog and searchable controls fit; and a mobile help tooltip stayed inside the viewport. Chrome and Edge touch emulation passed smoke checks on four core routes at 320×568, 768×1024, and 1920×1080. `npm run build`, `npm run lint`, and `git diff --check` passed.

## Remaining validation limits

- Browser checks used API fixtures because authenticated production data and credentials were unavailable. Live saving, approval, export, and authentication flows were not exercised.
- Firefox, Safari, iOS Safari, physical Android devices, and actual 200% browser zoom were not available for this run. Chromium mobile touch emulation and Chrome/Edge were tested.
- A full automated contrast and screen reader audit was not performed. The accessibility changes above were checked through control names, keyboard interaction, and visual inspection.
- Vite still reports a JavaScript chunk above 500kB. Bundle splitting remains separate from the layout changes.

The existing Power BI working tree changes were left untouched.

## Help page follow-up (October 7, 2026)

The new Help page uses the existing centered content container and sidebar drawer. Its guide cards form one column on small screens and two columns from the laptop breakpoint. Browser checks covered employee and system admin content at all 27 portrait, landscape, laptop, desktop, and ultrawide viewports listed above. Manager and admin content was checked at 390×844, 768×1024, and 1366×768. All 60 role-and-viewport checks passed without document horizontal overflow, and the mobile Help navigation link opened and closed the drawer correctly. Browser data was provided by read only API fixtures; the authenticated `/api/help` endpoint was tested separately for all four roles.

## Projectless non-billable row dialog (October 7, 2026)

The Add Project Row dialog hides optional weekly detail fields for a Non-Billable task with Requires Project set to No. Browser fixture checks covered 320×568, 390×844, 568×320, 768×1024, 1024×768, 1366×768, and 3440×1440. At each size the dialog stayed inside the viewport, its footer remained accessible, and neither the document nor dialog had horizontal overflow. Switching from a task that requires a project cleared hidden detail values; a Non-Billable task that still requires a project retained the detail form.

## Employee access, project locations, and descriptions (October 9, 2026)

- Employees need an assignment to an active admin or system admin to sign in or use an existing session. Password login, Microsoft callback, refresh tokens, and authenticated requests share the check. Login displays the server's explanation, including after an assignment is removed during a session. Manager, admin, and system admin access is unchanged.
- Location management is inside each division's expandable Locations section. The separate sidebar link is removed, and the previous location URL redirects to Divisions. Project forms show division and location first. Timesheet writes inherit both values from the project; the Add Project Row form no longer asks for them.
- Description (optional) is a textarea with a live 500-character counter and matching server validation. Saved descriptions preserve line breaks and wrap long unbroken text. Submitted and approved admin expansions, history, and manager review display descriptions; daily notes remain available. Mobile admin entries stack their details and description, while wider screens retain a table.
- Shared dialogs render in a portal attached to the document body. This prevents the surrounding page's vertical spacing from shifting a tall history dialog below the viewport. Focus trapping, Escape dismissal, and focus restoration are retained.

Browser checks used Chromium with the actual local API and an isolated in-memory database. They exercised rejected and accepted employee login, location creation and editing within a division, project location updates, the description counter and limit, saving and reloading a timesheet, submission and approval, and session revocation after assignment release. Non-billable projectless rows retained their existing form behavior. No production records were used.

Login notifications, division/location controls, project dialogs, timesheet descriptions and dialogs, submitted and approved expansions, and expanded history passed the 21 required viewport sizes in `RESPONSIVE_WEB_DESIGN_RULES.md`, plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768, and 1366×1024 (28 sizes total). Checks covered document overflow, dialog bounds and internal width, form widths, and description wrapping. Representative mobile, tablet, laptop, and ultrawide screenshots were inspected. Manager descriptions were also checked at these 28 sizes; mobile navigation, dialog keyboard containment, and the legacy location redirect were checked separately.

`npm test` passed 64 Node tests and 55 Power BI API checks, including six new employee/project workflow tests. `npm run lint`, `npm run build`, and `git diff --check` passed. The existing large JavaScript chunk warning remains. Microsoft identity verification was stubbed in the callback test; live Entra sign-in, other browser engines, physical mobile devices, and screen readers were not tested.

## Required project, description, task billing and division search (October 9, 2026)

This update supersedes the earlier projectless-row and optional-description behavior. Add Project Row now starts with required Project Code, filters Task Name/Number by project Billing Type, and requires Description. Tasks no longer show Requires Project. Divisions adds name/ID search, and Projects adds a required Billing Type select using the existing single-column/mobile and two-column/wide form layout.

Chromium checked these four affected surfaces at all 21 required viewports plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024: 112 checks passed with no document/dialog horizontal overflow, out-of-bounds dialogs or page errors. Divisions was checked with filtered results and expanded Locations, and the other surfaces with open dialogs. Screenshots at mobile, tablet, laptop and ultrawide sizes were inspected. Functional browser checks used the actual local API and an isolated in-memory database. See [the implementation and data audit](TIMESHEET_REQUIRED_CHANGES.md) for behavior, historical-data handling and validation limits.


## Permissions and Matrix help (October 10, 2026)

Shared settings now expose Manager/System Admin add and edit controls, with System Admin deletion/deactivation. Admin settings and monthly division records are read-only. Managers have division-scoped reports, dashboard team totals and team vacation reads. Navigation and page guards use the shared role policy. Management → Matrix help documents 64 functions with all four role columns, conditions, search, area filtering and a current-role filter. Employees cannot see its navigation link, Help guide or page, and the API returns 403.

Matrix help uses cards below the `lg` breakpoint and a locally scrolling table at wider sizes. Search/filter controls wrap on narrow screens and preserve their accessible labels. Holiday editing uses the shared responsive dialog. Department ownership inputs wrap their actions on mobile. A dialog focus fix remembers the opening control before autofocus fields mount, so Escape and close actions restore focus correctly.

Chromium with the actual local API and an isolated in-memory database passed 980 responsive checks at the 21 required sizes in `RESPONSIVE_WEB_DESIGN_RULES.md`, plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024 (28 total). This covered Matrix help for the three management roles, Employee route/sidebar/Help restrictions, manager settings and monthly forms, reports, dashboard, team vacation, Admin read-only pages, audit and Users, and 168 open-dialog checks. Functional browser checks created a shared Work Type as a Manager, saved a monthly travel record and read it as an Admin, verified restricted direct routing, and verified disabled Admin role/division-grant controls.

After the shared focus fix, 196 dialog checks (seven dialogs at all 28 sizes) passed viewport bounds, document/dialog width, keyboard containment, Escape dismissal and focus restoration. They covered Division, Location, Department, Dedicated/Flex, Work Type, Holiday edit and the Admin account editor. The area filter passed another 28-viewport check. An additional 34 checks covered Matrix filters and empty results, light/dark rendering, ownership add/edit forms, loading, error/retry recovery, and Employee API/Help restrictions. Mobile, tablet, laptop and ultrawide screenshots were visually inspected. No page errors or responsive regressions were found.

`npm test` passed 83 Node tests and 55 Power BI API checks. `npm run lint`, `npm run build`, and `git diff --check` passed. See [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md) for all functions, scope enforcement and audit migration details. Validation used synthetic data; production data, live Microsoft sign-in and external integrations were not exercised. Firefox, Safari, physical mobile devices and screen readers were not tested. The existing large JavaScript chunk warning remains.

## Planned vacation holidays and selection visibility (October 10, 2026)

Personal and team calendars now show company holiday names in week and month views, including adjacent-month dates and weeks crossing calendar years. Holiday badges wrap long names and remain visible when a holiday is selected for vacation. Selected dates use a solid teal background, white text, an inset border and a check mark in both themes. Hover preserves the selected background, and today's badge remains readable. Holiday loading and retry messages are independent of vacation editing.

Chromium with API fixtures passed 224 responsive checks: personal/team, week/month and light/dark at the 21 required viewports plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024. Checks covered document overflow, calendar bounds, local horizontal scrolling and cell content wrapping. Mobile, tablet, laptop, desktop and ultrawide screenshots were inspected. Functional checks covered holiday selection, keyboard toggling, saving, removal, discard, range selection, failed-save preservation, year boundaries, holiday loading/error/retry/empty states and employee access. Selected white text measured 5.3:1 contrast against its background; hover contrast also passed 4.5:1. No page errors or responsive regressions were found.

The 12 existing vacation and holiday tests, `npm run lint`, `npm run build` and `git diff --check` passed. Browser saving used fixture responses; live authenticated saving, other browser engines, physical devices and screen readers were not tested. The existing large JavaScript chunk warning remains.

## Reports upgrades (October 10, 2026)

Reports now shares inclusive date ranges and filters across Weekly Summary, Utilization, Project Hours, Missing Hours, Trends, drilldowns and downloads. Summary cards, billing categories, daily shortfalls, submission gaps, period comparisons, weekly/monthly trends, advanced filters and paginated entry details use the existing branding and shared dialog. The less-used filters collapse behind More filters; their active count remains visible. Mobile summary cards use two columns. Wide reports retain local horizontal scrolling, while entry details stack into readable cards.

Chromium with the actual local API and an isolated in-memory database passed 356 report page checks and 28 open-dialog checks. These covered all five populated views in light/dark mode at the 21 required viewports plus 568×320, 640×360, 844×390, 932×430, 800×600, 1024×768 and 1366×1024 (28 sizes). Checks covered compact/expanded filters, expanded project contributors, missing-date details, document width, form bounds, dialog bounds, keyboard containment, Escape dismissal and focus restoration. Admin/System Admin report views were additionally checked at mobile, tablet, laptop and ultrawide sizes; Employee report-route restrictions were checked at those four sizes.

Functional browser checks exercised all eight filters and reset, historical inactive options, cross-year custom dates in the America/Los_Angeles timezone, invalid/empty/future ranges, monthly trends, entry pagination and weekly details, all five Excel/PDF report downloads, drilldown PDF export, and report error/retry recovery. Updated Help and Matrix help content passed another 168 checks: three management roles, both pages and all 28 sizes. No page errors, document overflow or dialog regressions were found. Stable screenshots of mobile, tablet, laptop, desktop and ultrawide reports, entry dialogs and updated guides were visually inspected.

All six PDF types were rendered with Poppler. Seventeen generated pages passed title, page-number and character-bound checks. Representative first/last pages, project contributors, long descriptions, missing-date continuation pages and trend comparisons were inspected. The PDF footer no longer adds blank pages. Excel regression checks inspect report-specific sheets, filter metadata, reconciled totals, scoped entries and deduplicated weekly details.

`npm test` passed 101 Node tests and 55 Power BI API checks; `npm run lint`, `npm run build` and `git diff --check` passed. Eighteen new reporting tests include decimal-hour shortfalls and independent current/previous scope completeness. See [REPORTS.md](REPORTS.md) for calculation rules and access behavior. No schema migration or production data change was needed. Validation used synthetic records; production data, live Microsoft sign-in, other browser engines, physical mobile devices and screen readers were not exercised. The existing large JavaScript chunk warning remains.

## Maintenance token copying and Power BI connection hints (October 20, 2026)

API Token Generation now waits for clipboard writes before reporting success, falls back to the browser copy command when native clipboard access is unavailable or denied, and reports blocked copies with manual-copy guidance. Copy controls retain keyboard focus. The panel includes copyable timesheet-export and report-server addresses derived from the current origin, plus short Power BI Web/Basic-auth and existing GCC report setup instructions. Token controls wrap on narrow screens; long tokens wrap within the card and copy buttons stack on mobile.

Chromium tested the production build as a synthetic System Admin against the actual local API and an isolated in-memory database. All 28 sizes in `CHROMIUM_LAYOUT_TEST_CHECKLIST.md` passed before generation and with a long synthetic token, in both light and dark themes: **112 responsive checks**. Checks covered document width, card/control bounds, and shared header visibility. Representative mobile, tablet, laptop, desktop and ultrawide screenshots were inspected. Native copying of all three values, absent/denied clipboard fallback, blocked-copy feedback, temporary-field cleanup, focus restoration, keyboard copying, manual URL selection and mobile drawer/Escape behavior passed. A generated token successfully authenticated a separate timesheet-export request using Basic username `powerbi` and the token as its password. No browser exceptions or unexpected API failures occurred.

`node --test scripts/clipboard.test.js` passed five regression tests covering asynchronous completion, unavailable/denied native access, and failed/throwing fallback cleanup. `npm run lint`, `npm run build` and `git diff --check` passed. The local Graphify map was rebuilt. Screenshots and browser results were saved under the test machine's temporary `gcc-maintenance-copy-pZke8I` directory. Production data, live Power BI Desktop/Service refresh, other browser engines, physical devices and screen readers were not exercised.


## GCC product names (October 20, 2026)

The login heading, sidebar brand, footer, browser title, and exported report branding now use GCC Timesheet App. The browser icon uses the existing company logo. The sidebar retains its mobile drawer, 768px desktop breakpoint, collapsed mode, and established styles. No routing or permission rules changed.

Chromium tested the production frontend with the actual local API and an isolated in-memory database. All 28 checklist viewports passed login and failed-login states (56 checks), all five roles in light/dark themes with loaded shell and footer (560 checks), mobile drawer bounds/Escape (90 checks), and a collapsed sidebar check: **707 checks**, with no browser exceptions or unexpected server failures. Bounds and clipping checks passed for the longer product name. Representative login and shell screenshots were inspected at 375×667, 768×1024, 1366×768, 1920×1080, and 3440×1440; a separate capture run passed 33 additional checks.

Frontend lint/build and all 155 Node regression tests plus 55 reporting API checks passed. Evidence is stored under the local temporary gcc-reorganization directory. Production data, external integrations, Firefox/Safari, physical devices, and assistive technology were not exercised. See [the reorganization validation record](REORGANIZATION_VALIDATION.md) for repository, packaging, release, schema, and dependency-audit results.
