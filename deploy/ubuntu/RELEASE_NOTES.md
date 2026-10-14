Installable Ubuntu administrator for GCC TimeSheet. Run `timesheet` to open the interactive menu after installation.

- Uses the hostname and timezone already configured by IT.
- Installs Docker/Compose, Nginx and Avahi; configurable website and loopback app ports with conflict checks.
- Manual and scheduled app updates, backups and administrator self-updates; independent pause/resume controls.
- Backup checksums, restore validation, startup rollback, retention and optional off-VM copies.
- HTTPS configuration, health and port diagnostics, environment editor and bootstrap cleanup.
- Timestamped rotating logs, versioned administrator installations and administrator rollback.
- Setup guide and complete source-reference document shipped as release assets.

Application images use `ghcr.io/naveenbarrywehmiller/gcc_ts:latest` by default. This follows main-branch builds. Administrator releases use their own `timesheet-admin-v` tags and do not alter the Power BI or app release numbering.

Download `install.sh`, run `sudo bash install.sh timesheet-admin-v1.0.0`, then run `timesheet`. Read README.md first for prerequisites, TLS, schedules and recovery.
