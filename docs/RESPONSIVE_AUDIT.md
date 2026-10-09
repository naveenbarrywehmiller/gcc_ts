# Responsive design audit

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
