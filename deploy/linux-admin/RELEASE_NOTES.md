# GCC Timesheet Linux Admin v1.1.1

- Publish the Linux administrator under the GCC Timesheet Linux Admin name with the canonical `gcc-timesheet-linux-admin-v1.1.1` tag and matching tar/ZIP filenames.
- Support discovery/validation of canonical and legacy administrator release tags; keep the `timesheet` command, installed paths, data, backups, configuration, and schedules compatible.
- Update source/workflow/documentation paths to `deploy/linux-admin/` and regenerate the complete script reference.
- Keep the existing Ubuntu 24.04/26.04, application v1.30.0+, maintenance, backup/restore, and factory-reset contracts unchanged.

Install with `sudo bash install.sh gcc-timesheet-linux-admin-v1.1.1`, then run `timesheet`. Existing older builds that only discover legacy `timesheet-admin-v*` releases need this bootstrap once to enter the canonical release stream. Their application data and configuration are preserved.

The release workflow runs syntax/unit/package checks, builds the matching app revision, and exercises installation, Nginx, ports, timers, backup, restore, and reset on a disposable Ubuntu runner before publishing.
