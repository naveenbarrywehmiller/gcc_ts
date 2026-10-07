# Responsive Web Design Rules

## Permanent requirement and scope

**All future UI and frontend changes MUST maintain responsive behavior across mobile, tablet, laptop, desktop, and ultrawide screen sizes. No change should be considered complete if it introduces responsive regressions.**

These rules apply to every new page or component and every change to an existing UI: dashboards, forms, tables, modals, navigation, sidebars, headers, footers, cards, buttons, charts, dialogs, filters, search, login, admin and settings pages, mobile UI, and CSS. Responsive design is a permanent project requirement, not a one-time audit.

## Viewports to support

Use these dimensions as minimum validation points, in CSS pixels. Layouts must also work at intermediate widths and heights; the list does not prescribe device-specific breakpoints.

| Category | Required viewports |
| --- | --- |
| Mobile | 320 × 568, 360 × 640, 375 × 667, 390 × 844, 414 × 896, 430 × 932 |
| Tablet | 600 × 800, 768 × 1024, 810 × 1080, 820 × 1180, 834 × 1194, 1024 × 1366 |
| Laptop | 1280 × 720, 1366 × 768, 1440 × 900, 1536 × 864 |
| Desktop | 1600 × 900, 1920 × 1080, 2560 × 1440 |
| Ultrawide | 3440 × 1440, 3840 × 2160 |

Check mobile portrait and landscape and tablet portrait and landscape, especially for menus, calendars, dialogs, and controls near the bottom of the viewport.

## Layout foundations

1. **Build mobile first when practical.** Make the small-screen layout usable, then progressively enhance it for larger screens.
2. **Do not assume a fixed viewport.** Avoid unnecessary fixed dimensions and offsets such as `width: 1200px`, `height: 700px`, `left: 300px`, or `margin-left: 250px`. Prefer fluid widths, `max-width`, responsive containers, and `margin-inline: auto` where appropriate.
3. **Use Grid and Flexbox for layout.** `minmax()`, `clamp()`, `min()`, `max()`, flexible tracks, and fluid spacing can help content reflow. Avoid excessive absolute positioning, fixed heights and widths, negative margins, and pixel-based positioning. Use absolute positioning when the component genuinely requires it and verify its viewport bounds.
4. **Choose breakpoints from the layout.** Do not add a breakpoint for one device model or create redundant media queries. A useful width vocabulary is below, but adjust it to the actual component. This project already uses Tailwind's `sm`, `md`, `lg`, and `xl` breakpoints; prefer those existing utilities where they fit.

   | Width | General layout category |
   | --- | --- |
   | Below 480px | Small mobile |
   | 480–767px | Mobile |
   | 768–1023px | Tablet |
   | 1024–1279px | Small laptop |
   | 1280–1535px | Laptop/desktop |
   | 1536–1919px | Large desktop |
   | 1920px and above | Large/ultrawide |

5. **Contain wide layouts.** Use a suitable `max-width` and balanced whitespace instead of stretching primary content indefinitely on 1920px to 3840px monitors.
6. **Prevent page-level horizontal overflow.** Before completing a UI change, compare:

   ```js
   document.documentElement.scrollWidth
   document.documentElement.clientWidth
   ```

   Investigate and fix any unexpected difference at the responsible component. Do not use `body { overflow-x: hidden; }` to conceal an overflow defect. A table or calendar may scroll within its own container when that preserves readable content.

## Component rules

### Text, controls, and forms

- Keep text readable at every supported size. Use responsive type such as `clamp()` where it helps; do not rely on desktop-sized headings on mobile or shrink body text until it becomes unreadable. Allow long names, labels, and values to wrap without clipping.
- Keep important touch targets approximately 44px or larger where practical. Buttons and controls must remain visible, separated, inside the viewport, and usable by touch and keyboard. Do not make essential actions hover-only.
- Let multi-column desktop forms become a readable single column on narrow screens. Inputs, labels, validation messages, and action buttons must fit without clipping or overlap.

### Tables, cards, and charts

- Do not shrink complex tables until their contents are unreadable. Choose a local horizontal scroll container, priority columns, fewer columns, cards, or expandable rows according to the data. Preserve access to important information and keep the page itself from scrolling sideways.
- Let card grids reflow naturally: multiple columns on wide screens, fewer on tablets, and one when mobile width requires it. Use Grid or Flexbox instead of manual placement.
- Keep charts within their parent container. Check labels, legends, tooltips, axis text, height, and mobile readability at the supported sizes. A chart must not force page-level overflow.

### Dialogs, navigation, and media

- Fit modals and dialogs within the viewport on mobile. Let long content scroll within the dialog, keep close and action controls accessible, and avoid clipping. Verify short landscape viewports as well as portrait phones.
- Reflow navigation instead of letting items overflow. A mobile menu or drawer is appropriate where desktop navigation cannot fit. A sidebar must not consume most of a small viewport; use the project's responsive drawer pattern where applicable.
- Keep images and other media within their containers (`max-width: 100%; height: auto` when suitable). Preserve aspect ratio unless cropping is intentional.

## Accessibility and implementation

- Responsive changes must preserve keyboard navigation, visible focus, proper labels, accessible buttons, screen-reader compatibility, adequate contrast, readable text, and usable touch targets. Check focus order and reachability when a layout changes or a drawer or dialog opens.
- Before adding CSS, inspect the existing component, reusable classes, and media queries. Avoid duplicate rules, conflicting breakpoints, unnecessary `!important`, and global overrides where a component-level rule works. Keep responsive rules near the component when the architecture supports it.
- Use CSS media queries and responsive layouts for presentation. Use JavaScript viewport or resize listeners only when runtime behavior actually requires them; do not add them for a layout CSS can express.
- Preserve branding, colors, typography, icons, component appearance, established interaction patterns, and business behavior unless changing them is necessary to resolve a responsive or usability problem.

## Review checklists

For **every new UI component**, consider:

- [ ] Mobile, tablet, laptop, desktop, and ultrawide layouts
- [ ] Portrait and landscape orientations
- [ ] No unexpected document horizontal overflow
- [ ] Text wrapping and readable type
- [ ] Button size, spacing, touch use, and keyboard use
- [ ] Labels, focus, contrast, and screen-reader compatibility
- [ ] Loading, empty, and error states

For **every change to an existing component**, check:

- [ ] Desktop, laptop, tablet, mobile, and ultrawide layouts still work
- [ ] No new horizontal overflow, clipped text, or overlapping controls
- [ ] Buttons, navigation, forms, tables, and modals remain usable where affected
- [ ] Related breakpoints and both orientations still work
- [ ] Existing design language and functionality remain intact

## Definition of done and regression prevention

A frontend change is complete only when its functionality works and the affected UI remains usable on mobile, tablet, laptop, desktop, and ultrawide screens in relevant orientations. The page must have no unexpected horizontal overflow, clipped content, or overlapping components. Text, buttons, forms, tables, modals, navigation, and accessibility must remain usable, and the existing design language must be preserved. A change that breaks any supported size is incomplete, even if another size works.

Use the viewport list above for relevant responsive checks and inspect intermediate widths when content changes shape between them. Test the states touched by the change, including open menus or dialogs and populated content where applicable. Record any environment or browser coverage limits instead of claiming unverified coverage. The [responsive audit](docs/RESPONSIVE_AUDIT.md) documents the existing implementation and its validation baseline.

## Instructions for AI and coding agents

Whenever modifying the frontend:

1. Read this file and follow every applicable rule.
2. Inspect the existing responsive implementation before editing.
3. Consider mobile, tablet, laptop, desktop, and ultrawide behavior.
4. Check for responsive regressions caused by the change and fix them.
5. Do not declare the work complete while it causes a responsive problem.

**RESPONSIVE DESIGN IS A PERMANENT REQUIREMENT. Every future frontend and UI modification must follow this document from the start of implementation.**
