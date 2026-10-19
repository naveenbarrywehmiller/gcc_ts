# Chromium responsive and loading-state checklist

Use this checklist for future layout tests alongside the permanent [responsive design rules](../RESPONSIVE_WEB_DESIGN_RULES.md). Check every affected page and state. When changing the shared shell, navigation or route loading, include the route sweep below.

## Test setup

- [ ] Run Chromium against the production build when testing route chunks or loading behavior.
- [ ] Use synthetic users and an isolated test database when exercising the actual API.
- [ ] Capture browser exceptions and unexpected API failures throughout the run.
- [ ] Wait for page content, fonts and finite layout/sidebar animations to settle before measuring or taking screenshots. Infinite loading animations must not block measurements.

## Viewport list

Use CSS pixels. These are the 21 required sizes plus seven landscape checks used in the October 19, 2026 validation.

| Category | Width × height |
| --- | --- |
| Mobile | 320 × 568, 360 × 640, 375 × 667, 390 × 844, 414 × 896, 430 × 932 |
| Tablet | 600 × 800, 768 × 1024, 810 × 1080, 820 × 1180, 834 × 1194, 1024 × 1366 |
| Laptop | 1280 × 720, 1366 × 768, 1440 × 900, 1536 × 864 |
| Desktop | 1600 × 900, 1920 × 1080, 2560 × 1440 |
| Ultrawide | 3440 × 1440, 3840 × 2160 |
| Mobile landscape | 568 × 320, 640 × 360, 844 × 390, 932 × 430 |
| Tablet landscape | 800 × 600, 1024 × 768, 1366 × 1024 |

Copyable viewport data for browser checks:

```js
const viewports = [
  [320, 568], [360, 640], [375, 667], [390, 844], [414, 896], [430, 932],
  [600, 800], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366],
  [1280, 720], [1366, 768], [1440, 900], [1536, 864],
  [1600, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160],
  [568, 320], [640, 360], [844, 390], [932, 430], [800, 600], [1024, 768], [1366, 1024],
];
```

## Responsive checks at every viewport

- [ ] The expected page content renders and the shared header remains visible.
- [ ] `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; wide tables and calendars scroll inside their own containers.
- [ ] Text wraps readably, controls remain reachable, and no content overlaps or clips unexpectedly.
- [ ] Navigation follows the existing mobile drawer and desktop sidebar breakpoints.
- [ ] Affected dialogs, menus, forms and filters fit the viewport; long content scrolls locally.
- [ ] Keyboard navigation, visible focus, labels and important touch targets remain usable.
- [ ] Exercise populated, empty and error/retry states where the change affects them.

## Loading-state checks

Use a fresh browser context and temporarily hold a lazy route's JavaScript request, such as `/assets/Reports-*.js`, so the loading state stays visible. Delay the request without aborting it; release it after the checks.

- [ ] The route loading status appears inside the existing content area with an accessible status announcement.
- [ ] At all 28 viewports, the document has no horizontal overflow and the loading status stays within viewport bounds.
- [ ] The shared header and navigation remain available while the screen loads.
- [ ] On mobile, open the navigation drawer and close it with Escape while the chunk is still delayed.
- [ ] Release the delayed request and verify that the requested screen replaces the loading status successfully.
- [ ] No browser exceptions or unexpected API failures occur during loading or after completion.

## Route and permission checks when routing or lazy loading changes

- [ ] Visit affected URLs directly as System Admin, Admin, Manager, Employee, Viewer and a signed-out user; preserve the existing guards and redirects.
- [ ] A denied route redirects without requesting its deferred screen chunk.
- [ ] Home does not request unopened admin or reporting screen chunks.
- [ ] Opening a deferred screen requests its chunk; unrelated deferred screens remain unloaded.
- [ ] Client navigation, browser Back/Forward and legacy redirects still work.

### Full deferred-screen route sweep

| Screen | URL |
| --- | --- |
| Matrix help | `/admin/matrix-help` |
| Team Approvals | `/manager/approvals` |
| Reports | `/reports` |
| Users | `/admin/users` |
| Projects | `/admin/projects` |
| Task Name/Number | `/admin/tasks` |
| Platforms | `/admin/platforms` |
| Divisions | `/admin/divisions` |
| Departments | `/admin/departments` |
| Dedicated/Flex | `/admin/supporting-categories` |
| Work Type | `/admin/activities` |
| Holidays | `/admin/holidays` |
| Admin Approvals | `/admin/approvals` |
| Audit Log | `/admin/audit` |
| Travel & VISA | `/admin/travel` |
| Open Position / New Joiners | `/admin/staffing` |
| Error Logs | `/admin/error-logs` |
| System Maintenance | `/admin/system` |

Also check `/admin/subdivisions`: authorized users should reach `/admin/divisions`; unauthorized users should retain the existing redirect behavior.

The October 19 baseline was **18 screens × 28 viewports = 504 responsive checks**, plus **28 delayed-loading checks = 532 total**. The separate permission sweep covered **19 URLs × 6 authentication states = 114 direct-link checks**. Adapt the page/state count to the change and report the actual coverage.

## Evidence to record

- [ ] Inspect screenshots at mobile 375 × 667, tablet 768 × 1024, laptop 1366 × 768, desktop 1920 × 1080 and ultrawide 3440 × 1440. Include loading and loaded states when route loading changes.
- [ ] Record the pages, states, roles, viewport count, failures and fixes in [RESPONSIVE_AUDIT.md](RESPONSIVE_AUDIT.md).
- [ ] Record browser/API errors, build and lint results, and any relevant focused tests.
- [ ] State coverage limits, including untested browsers, physical devices, themes or assistive technology. Do not claim visual or functional checks that were not performed.
