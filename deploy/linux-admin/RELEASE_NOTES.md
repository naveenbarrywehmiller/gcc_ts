# GCC Timesheet Linux Admin v1.2.1

- Add a read-only live home dashboard for CPU, RAM, swap, disks, filesystem usage, OS, virtualization and IP addresses. Refresh every five seconds on suitable terminals; preserve typed selections and support manual refresh in small/plain terminals.
- Give submenu results fresh screens, wrapped output, readable status/timer sections, clearer backup listings and organized diagnostics. Keep command details in the log and destructive confirmations in place.
- Replace the 33-option home menu with seven focused categories plus Help, using submenu-local numbering, Back/Home/Exit navigation and a compact saved-settings summary.
- Add color, optional emoji, descriptions and examples for every action. `?number` explains an action without running it; Help includes a display check. `timesheet --plain`, `NO_COLOR` and `TIMESHEET_NO_EMOJI` support simpler terminals.
- Remove Avahi repair and UFW-rule actions from the interactive panel. Existing CLI commands and setup behavior remain compatible.
- Keep operation locking, safety backups and destructive confirmations; add confirmation before stopping the app. Return to the current category after an action, cancellation or ordinary error.
- Wrap terminal content and long examples for narrow SSH windows. Add the presentation module to installation validation, release bundles and the generated source reference.

Install using the [v1.2.1 installer and guide](https://github.com/naveenbarrywehmiller/gcc_ts/blob/gcc-timesheet-linux-admin-v1.2.1/deploy/linux-admin/README.md), or choose **Application and tool updates > Update administrator** in an existing installation. App data, container image, website settings, schedules and backups are preserved by an administrator-only installation.

Validation: 47 unit tests passed on Ubuntu 26.04.1 LTS, including Linux terminal refresh/input checks; 22 read-only installed-panel sessions covered all categories, every action's help and actual status, backups, database integrity, diagnostics and display. The company app remained healthy throughout the tool update.

The existing release workflow continues to run syntax/unit/reference checks and the disposable Ubuntu deployment smoke test before publishing tagged releases.
