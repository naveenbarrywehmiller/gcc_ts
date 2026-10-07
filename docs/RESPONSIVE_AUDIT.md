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
