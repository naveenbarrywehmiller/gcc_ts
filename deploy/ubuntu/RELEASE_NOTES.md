GCC TimeSheet Administrator v1.1.0

- Clean setup: only the initial System Admin, no sample business data.
- Default reboot startup via Docker always policy; menu 32 / autostart enable|disable.
- Factory reset with explicit warning, required automatic backup, failure recovery, paused jobs and factory System Admin; menu 33 / factory-reset --confirm.
- Backup/restore/reset automatically enter persistent web maintenance. Only System Admin web login releases access after operations finish.
- Backup menus/status print absolute snapshot and database locations.
- Requires application v1.30.0 or later; the archive format stays at 1, but restored app images must support the new maintenance/health contract.

Install with `sudo bash install.sh timesheet-admin-v1.1.0`, then run `timesheet`. See the included README.md and complete SCRIPTS.md reference. Application v1.30.0 is released separately.
