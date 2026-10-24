# GCC Timesheet Linux Admin v1.4.0 — Ubuntu setup and operations

**Installer (v1.3.0):** [GitHub release and downloads](https://github.com/naveenbarrywehmiller/gcc_ts/releases/tag/gcc-timesheet-linux-admin-v1.3.0) · [Direct installer](https://github.com/naveenbarrywehmiller/gcc_ts/releases/download/gcc-timesheet-linux-admin-v1.3.0/install.sh) · [Complete script reference](SCRIPTS.md)

The Power BI management controls and separate LAN/public/API home addresses are new in **v1.4.0**, currently a local build. The published installer above installs v1.3.0. Build this source with `python3 deploy/linux-admin/build_release.py`, extract the bundle and run `sudo python3 manager.py install-bundle gcc-timesheet-linux-admin-v1.4.0` to install the local build. Reporting is not enabled by installing this administrator.

On your **Ubuntu VM**, run:

```bash
sudo apt update
sudo apt install -y curl ca-certificates
curl -fL --retry 3 \
  https://github.com/naveenbarrywehmiller/gcc_ts/releases/download/gcc-timesheet-linux-admin-v1.3.0/install.sh \
  -o /tmp/timesheet-install.sh
sudo bash /tmp/timesheet-install.sh gcc-timesheet-linux-admin-v1.3.0
timesheet
```

The installer downloads the tagged bundle, verifies its SHA-256 checksum and installs the administrator command. **Typing `timesheet` opens the interactive menu**, requesting your normal sudo password if needed. Choose **5 — Setup and configuration > 1 — Install / resume setup**. Run these commands on Ubuntu, not Windows PowerShell.

For later administrator versions, use **Application and tool updates > Check administrator release / Update administrator**. The menu reloads after a successful tool update. The installer without a tag also discovers the newest stable `gcc-timesheet-linux-admin-v…` or legacy `timesheet-admin-v…` release; app and Power BI releases are ignored.

## What the tool uses from IT's configuration

The tool reads the existing system hostname and timezone. It does not run `hostnamectl set-hostname`, change `/etc/hosts`, change the timezone, configure static IPs or enable/reset the firewall. Avahi advertises the existing hostname. All schedules use the system's local timezone, including its daylight-saving rules.

Ubuntu Server **24.04 or 26.04 LTS**, Python 3.12+, a sudo account and outbound HTTPS access are required. Python and basic download tools are installed by the bootstrap. A starting VM size is 2 vCPU, 4 GB RAM and 60 GB SSD; actual capacity depends on usage. IT should provide a DHCP reservation/static IP and allow access to Ubuntu mirrors, Docker's package repository, GitHub, GHCR and their download endpoints. Configure APT/Docker proxies through IT if required.

**Application compatibility:** use app **v1.30.0 or later** with this administrator, including `/api/health/live` and `factoryReset.js`. Menu **Application and tool updates > Choose application version** can pin `v1.30.0`. For local installation, build the bundle with `python3 deploy/linux-admin/build_release.py` and install its extracted files using `sudo python3 manager.py install-bundle gcc-timesheet-linux-admin-v1.4.0`. Restoring a snapshot whose app image predates these endpoints requires its original administrator version first, followed by an app/tool upgrade; 1.1.0 aborts/rolls back when the old image cannot pass its health checks.

## First installation, in order

1. Run the commands at the top of this guide, then type `timesheet`.
2. Choose **Setup and configuration > Install / resume setup**. The screen shows the system hostname and timezone. The suggested browser address is `<existing-hostname>.local`.
3. Choose a website port. **8080** is the default to avoid taking over an existing company web server; choose **80** if available and you want no port suffix. Occupied ports are rejected. Choose a different internal app port if **3001** is occupied. It is bound to `127.0.0.1` only.
4. Accept the factory email **systemadmin@barry-wehmiller.com** and leave the hidden password input blank to use **systemadmin**. You may instead supply a custom initial administrator and a 12+ character password. The fresh database contains only that System Admin; all business directories are empty. The script generates independent JWT secrets and a reporting API key. Automatic app startup after OS reboot is enabled by default; configure it with **App control > Startup after reboot**.
5. Confirm installation. Docker Engine/Compose, Nginx, Avahi and supporting packages are installed. An existing working Docker installation is preserved. The image is pulled and pinned by digest, startup migrations run, and health is checked.
6. IT must allow the chosen web port through company and VM firewalls. Avahi repair and firewall-rule actions are no longer offered in the interactive panel.
7. Open the displayed URL on an employee device. For example, a server named `gcc-app01` using port 8080 is `http://gcc-app01.local:8080`. Sign in, create your own Platform, Division and other required records, and verify a timesheet.
8. Choose **Setup and configuration > Remove bootstrap credentials** after successful login to remove bootstrap credentials from the environment. This leaves the created account intact.
9. Choose **Setup and configuration > Website address, ports and HTTPS** to configure HTTPS, then test login, save/submit and approvals over HTTPS before employee use.
10. Choose **Backups and database > Create a backup** for your first backup, **Backups and database > Check database integrity** to check the database and **Automatic jobs > Configure schedules** to configure automatic jobs. Schedules start **disabled** until you enable them.
11. Set backup retention/off-VM copying with **Backups and database > Retention and off-VM copies**, and test restoring a backup on a separate test VM.

If an installation is interrupted after environment creation, choose **Setup and configuration > Install / resume setup** again or run `timesheet resume-setup`. It retries the pull and remaining setup using the saved settings. Review the timestamped log if dependency installation failed. An existing deployment from the earlier shell-only guide is deliberately detected rather than overwritten: preserve its database/configuration and migrate with IT before using new setup. The v1.0.0 backup format belongs to this administrator; legacy archives must be restored with their original tool first.

The Docker image is **`ghcr.io/naveenbarrywehmiller/gcc_ts:latest`** ([package](https://github.com/naveenbarrywehmiller/gcc_ts/pkgs/container/gcc_ts)). `latest` follows main-branch builds, including changes before a tagged app release. **Application and tool updates > Choose application version** chooses a fixed app tag or immutable digest instead. Updates use published container images; the server does not need a Git checkout or host Node.js.

## Panel navigation (v1.4.0)

The home screen shows the LAN website with its port, an optional public Funnel website, and the full Power BI API address. With Funnel enabled, the displayed API uses public HTTPS; the Power BI submenu also gives the LAN API address. An address alone does not mean reporting is enabled. Live measurements include CPU usage, logical CPU/core/thread counts, processor, usable RAM and available RAM, swap, disk capacity, root-filesystem usage, OS, virtualization and the default network interface's IP addresses. CPU use is measured between refreshes; memory use is total minus Linux `MemAvailable` (reclaimable cache is available). Disk capacity and root-filesystem capacity are separate; available filesystem space excludes reserved blocks. Missing measurements say unavailable.

On an interactive ANSI terminal with enough room, the home screen refreshes every **5 seconds** and preserves a partially typed selection. **R** refreshes immediately after Enter. A small window, redirected output, `TERM=dumb` or `timesheet --plain` uses a scrollable snapshot with **R** to refresh. Enlarge a small terminal and press R to enable live refresh. Hardware identity is read when the panel opens; CPU, memory, root usage and IP addresses update with each refresh. Refreshing only reads system state and does not restart or update the application.

The saved startup preference, enabled-job count and maintenance flags are also shown. **App control > Status and website** reads actual container health and timer states in labeled sections, without wide Docker tables. It shows each job's saved preference, actual timer state, calendar and next run. Submenus and action results start on fresh screens; operation output wraps to the terminal width, and the result footer returns you to the same category. Full commands remain in the administrator log. CLI status and detailed diagnostics remain available for scripts.

| Home choice | Category | Available actions |
|---|---|---|
| 1 | App control | Status, start/apply settings, restart, stop, reboot startup |
| 2 | Backups and database | Create/list backups, integrity check, restore, retention/off-VM copies, expired-backup preview |
| 3 | Application and tool updates | App update/version/retry; administrator check/update/rollback |
| 4 | Automatic jobs | Configure, pause and resume backup/app/tool schedules |
| 5 | Setup and configuration | Install/resume, website/ports/optional HTTPS, dependency repair, bootstrap cleanup, private environment editor, Tailscale Funnel, Power BI management |
| 6 | Logs and diagnostics | Application logs, administrator logs, server diagnostics |
| 7 | Advanced maintenance | Ubuntu/Docker upgrades and factory reset |
| H | Help and display | Installed guide and color/emoji check |
| 0 | Exit | Leave the administrator |

Submenus number their own actions. **0** goes back, **M** returns home and **Q** exits. Each action has a description; enter **?number**, such as **?4**, to read its example and cautions without running it. After an action or an ordinary error, Enter returns to the same category.

Example: **2 > 1** creates a backup. **2 > ?4** explains restore without restoring anything. **3 > 2** chooses an application image tag; enter `1.34.0`, then choose **3 > 1** to update. A GitHub release tag is not necessarily a container image tag.

Colors distinguish headings, choices, completion messages, cautions and errors; text labels carry the same meaning. Emoji are optional decoration. Use **H > 2** to check terminal rendering. `timesheet --plain` provides ASCII text without ANSI colors or emoji. `NO_COLOR=1` disables colors and `TIMESHEET_NO_EMOJI=1` disables icons. Output automatically becomes plain when redirected or when `TERM=dumb`; narrow terminals wrap text and examples. Terminal preferences are per invocation, not application settings.

The old **11 — Avahi repair** and **12 — UFW rules** choices have been removed from the interactive panel. Their existing CLI commands remain for compatibility with administrator scripts; setup still uses the current hostname and existing supporting services. No hostname, timezone, DNS or firewall policy is changed by opening the panel.

Stop asks for confirmation. Restore, pruning, tool replacement and OS upgrades keep their confirmations; factory reset still requires `FACTORY RESET` and a safety backup. Operations are serialized with a lock, so a manual update cannot overlap an automatic backup. Avoid running raw Docker/Compose commands during menu operations.

## Ports, hostname, HTTPS and Avahi

**Setup and configuration > Website address, ports and HTTPS** checks that new ports are free, creates a backup, changes the Compose binding and Nginx listener, updates the application origin/cookie settings and checks startup. On failure it attempts to restore the saved deployment. Requests receive HTTP 503 while changes run. Old UFW rules are not removed automatically; have IT remove obsolete access rules after verifying the new port.

Avahi supplies `<system-hostname>.local` on a local multicast-enabled subnet. It does not create company-wide DNS records. `localhost` means the computer running the browser. Different VLANs, VPNs or Wi-Fi isolation may prevent `.local` resolution; use a company DNS record for those clients. Custom names entered in the menu require matching IT DNS records or client configuration. The tool advertises HTTP/HTTPS services through Avahi without rewriting IT's daemon policy.

```bash
hostnamectl
timedatectl
avahi-resolve-host-name -4 YOUR_EXISTING_HOSTNAME.local
sudo journalctl -u avahi-daemon -n 100 --no-pager
sudo ss -lntup
```

For HTTPS, ask IT for a PEM certificate chain and unencrypted PEM private key covering the browser hostname, with the issuing CA trusted on employee devices. Use **Setup and configuration > Website address, ports and HTTPS**, select HTTPS, usually port **443** or **8443**, and provide the two absolute file paths. The script checks the hostname and public-key match before installation. The private key is kept root-only. An existing certificate can be reused by leaving the path blank. `.local` requires an internal CA; use company DNS with an appropriate certificate when available. Switching to HTTPS replaces the configured HTTP listener; no separate redirect listener is added automatically.

HTTP is appropriate for initial connectivity checks. Set up trusted HTTPS before employee use. Do not expose port 3001/the selected internal app port: Docker binds it only to loopback, and Nginx supplies the single trusted proxy hop. [Docker explains why unrestricted published ports can bypass UFW](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).

## Tailscale Funnel: public HTTPS (v1.3.0)

Choose **5 > 6 — Tailscale Funnel**, then Status, Install/connect, Enable or Disable. Funnel provides a public internet URL such as `https://timesheet.example.ts.net`; visitors use the normal Timesheet login and do not need Tailscale installed. Tailscale manages the public HTTPS certificate, while the existing LAN website can continue using HTTP.

1. Use **Install / connect Tailscale** to install its signed stable Ubuntu package if absent. Open the displayed device sign-in URL using the Tailscale account for this server and approve the device. Login URLs are displayed without being written to the administrator log; auth keys are not requested or saved in app settings.
2. Change the factory System Admin password in the local Timesheet app. Enable refuses the known factory password; keep the replacement private.
3. Choose **Enable public HTTPS**. Tailscale may display a second browser approval link for Funnel/HTTPS permissions in a new tailnet. Complete that approval and retry if the command times out. MagicDNS, HTTPS certificates and Funnel permission must be enabled for the device.
4. The tool takes a safety snapshot, sets the public application base URL and exact LAN/public CORS origins, then briefly restarts the app. A dedicated Nginx listener binds only to `127.0.0.1:8081` by default; Tailscale forwards public HTTPS to it. That listener applies Secure/HttpOnly/SameSite=Lax to authentication cookies and preserves trusted client IPs for rate limiting. The existing LAN listener keeps its original cookie behavior.
5. Open the public URL and sign in with your private credentials. The home screen and status view show the saved public URL; **Funnel > Status** checks the actual Tailscale mapping and public gate.

The saved mapping does not prove public DNS or internet access works. Test the normal public URL from outside the tailnet before sharing it. During the company-server setup, public DNS initially returned no address even though HTTPS through the Funnel relay worked; the public record later appeared. A computer may retain a failed lookup after that record is available. Recheck DNS and clear its local DNS cache if needed (`Clear-DnsClientCache` in Windows PowerShell). Keep normal TLS certificate verification enabled.

```bash
timesheet funnel status
timesheet funnel connect
timesheet funnel enable --confirm
timesheet funnel enable --proxy-port 8082 --confirm  # if the default loopback port is occupied
timesheet funnel disable --confirm
```

Only this app's HTTPS port 443 mapping is managed. Enable refuses another website or mounted paths already using that port. Disable preserves other Tailscale routes and the LAN website. It blocks local public ingress before removing the mapping, so a cleanup failure leaves the app private. A failed enable also leaves public ingress blocked; correct the issue and retry Enable.

Funnel resumes after reboot through `tailscaled` and the persistent background mapping. Review device approval and key-expiry settings in the Tailscale console for unattended server operation. The tool leaves the system hostname, timezone, DNS resolver and subnet routes under their existing control; connecting uses `--accept-dns=false --accept-routes=false` and preserves the current Tailscale SSH setting. A new installation leaves Tailscale SSH disabled. There is no SSH toggle in this menu; an administrator can separately enable it with `sudo tailscale set --ssh=true`. The Tailscale package manages its own networking rules.

Restoring a snapshot or resetting application data writes a persistent public-access block outside snapshot contents. Public access stays paused after startup and browser System Admin login; verify restored credentials and explicitly enable Funnel again. Rollback to an administrator older than v1.3.0 requires disabling Funnel first. Tailscale device keys and account state are not included in Timesheet snapshots; connect a replacement server separately before enabling sharing there.

This is public sharing, not a tailnet-only access restriction. Funnel uses the device's `*.ts.net` domain and supported HTTPS ports, and has bandwidth limits. See the official [Funnel requirements](https://tailscale.com/docs/features/tailscale-funnel) and [CLI commands](https://tailscale.com/docs/reference/tailscale-cli/funnel).

## Power BI reporting management

Choose **5 — Setup and configuration > 7 — Power BI reporting management**. The submenu includes actual running status and LAN/public addresses, connection/setup help, an authenticated version check, private key display, enable/disable and key rotation. Home never displays a reporting key. Private key display requires confirmation and an interactive terminal; redirected output is refused.

For example, a LAN site at `http://10.4.2.68:8080` has the reporting API `http://10.4.2.68:8080/api/powerbi`. Each API address is a namespace: append `/version` for compatibility or `/timesheets` for work entries. A configured custom namespace remains available; `/api/powerbi` is also the application's canonical alias.

For the repository's GCC_Dashboard project, set **ApiBaseUrl** to the website origin, such as `https://device.tailnet.ts.net`, and **ApiPath** to `api/powerbi`. Use **Data source settings > Edit permissions > Basic**, username `powerbi`, with the reporting API key as the password. Store the key in Power BI's credential dialog. Use HTTPS for credentials; leave keys out of URLs, M queries, screenshots and Git. See the [dashboard connection guide](https://github.com/naveenbarrywehmiller/gcc_ts/blob/main/powerbi/documentation/POWERBI.md) and Microsoft's [Web connector authentication](https://learn.microsoft.com/en-us/power-query/connectors/web/web).

```bash
timesheet powerbi status
timesheet powerbi guide
timesheet powerbi test
timesheet powerbi key --confirm          # private interactive terminal only
timesheet powerbi enable --confirm
timesheet powerbi disable --confirm
timesheet powerbi rotate-key --confirm
```

Reporting stays in its existing state until explicitly changed. Enable/disable and rotation take a safety snapshot and briefly restart the app. If applying a setting fails, the previous private environment is restored; newer business data is never replaced. Enabling creates a strong random key when none exists and rejects an existing key shorter than 32 characters. Rotation preserves the enabled/disabled state and requires updating all Power BI clients' credentials. Connection tests call `/version`, hide credentials and response bodies, verify TLS normally for public HTTPS and refuse redirects.

The reporting key allows organization-wide read access; it is separate from a normal Timesheet login and cannot change records. Report publication, workspace permissions and refresh schedules belong to Power BI. A LAN source needs a gateway with access to the private server for Power BI Service refresh. For public HTTPS, configure the service's source credentials and verify refresh before scheduling it. See Microsoft's [refresh configuration](https://learn.microsoft.com/en-us/power-bi/connect-data/refresh-scheduled-refresh).

## Manual and automatic jobs

There are three independent job types:

| Job | Default schedule, disabled until enabled | What it changes |
|---|---|---|
| `backup` | Daily 02:00 | Creates a stopped, consistent application snapshot |
| `update` | Daily 03:00 | Pulls the selected app image, backs up and updates if changed |
| `self-update` | Sunday 04:00 | Installs the latest stable administrator release |

Use **Automatic jobs > Configure schedules** to enter schedules and enable jobs. It validates each expression with `systemd-analyze calendar`. Examples are `*-*-* 02:00:00`, `Sun *-*-* 04:00:00`, or `*-*-* *:00:00`. Use off-hours for backup/app updates because the app stops briefly. The VM's timezone is used; the script never changes it.

Use **Automatic jobs > Pause jobs / Resume jobs** to pause/resume `backup`, `update`, `self-update` or `all`. Pausing affects future triggers; a running operation finishes normally. Scheduled commands also check saved enabled/paused settings. Timers use `Persistent=false`, so a missed overnight run does not interrupt employees immediately after a daytime VM boot. Jobs log success/failure to the rotating log and journald; configure your company monitoring to alert on failed units and stale backups. Email/Slack alerts are not configured by this package.

```bash
timesheet backup
timesheet update
timesheet update --retry
timesheet check-self-update
timesheet self-update
timesheet pause backup
timesheet pause update
timesheet pause self-update
timesheet pause all
timesheet resume backup
timesheet resume update
systemctl list-timers --all 'timesheet-*'
sudo journalctl -u timesheet-update.service -n 100 --no-pager
sudo journalctl -u timesheet-backup.service -n 100 --no-pager
sudo journalctl -u timesheet-self-update.service -n 100 --no-pager
```

Automatic tool updates are optional. Administrator versions use separate `gcc-timesheet-linux-admin-vX.Y.Z` release tags (with legacy `timesheet-admin-vX.Y.Z` discovery retained). Checks ignore application and Power BI releases, verify downloaded checksums, validate Python/Bash syntax, install into a new version directory and switch the `current` link. Previous tool code remains available through **Application and tool updates > Roll back administrator** or `timesheet self-rollback`. App data and scheduling settings persist across tool updates. If you roll back the tool, pause `self-update` until you are ready to upgrade again.

## What an app update does

The tool checks current app health and pulls the selected image while it is online. If the image is unchanged, it exits without stopping the app. Otherwise it gates Nginx, stops the app, snapshots database/WAL, uploads, environment/configuration and TLS files, and starts the new immutable image digest. It waits for Docker health and the API health endpoint.

On startup failure, it attempts to restore both the previous image and pre-migration database/configuration. A failed image ID is recorded and blocked from automatic retries. **Application and tool updates > Retry a failed app image** explicitly retries it after you fix the cause. If recovery itself fails, the maintenance gate remains active and the log identifies the failed operation. Do not run Watchtower or another updater on this container: it would bypass this backup/rollback sequence.

Startup checks do not verify every business workflow. A functional issue found later requires a reviewed manual restore, which replaces data saved since the snapshot. Updates and stopped backups have downtime; no zero-downtime promise is made.

## Backup, retention and off-VM copies

Backups are stored under `/var/backups/gcc-timesheet`, with SHA-256 sidecars. They contain private environment secrets, employee data and TLS private keys, so keep both local and off-VM copies access-controlled and encrypted at rest under company policy.

The app is stopped while snapshots are created so SQLite/WAL and uploads stay consistent. Scheduled/manual backups restart an app that was running, but leave an intentionally stopped app stopped. **Web maintenance remains enabled after every backup until a System Admin signs in through the browser.** This applies to scheduled backups too. The script checks space before archiving. Old Docker images are retained under recovery tags. **Backups and database** show absolute snapshot paths under `/var/backups/gcc-timesheet`; database-only safety copies are under `/opt/gcc-timesheet/app-backup`.

**Backups and database > Retention and off-VM copies** configures retention from 7–3650 days and optional automatic pruning after successful scheduled backups. Pruning always retains the newest three snapshots. **Backups and database > Review expired backups** previews before manual deletion. Automatic pruning is off by default. Docker images are never automatically pruned; review recovery tags and registry retention before deleting images needed for rollback.

For an off-VM copy, enter `backupuser@backup.company.example:/srv/backups/gcc-timesheet/` in **Backups and database > Retention and off-VM copies**. IT must first provision that destination, root's restricted SSH key and its verified SSH `known_hosts` entry. Copies use noninteractive SSH with strict host-key checking and transfer each completed archive and checksum. They never delete remote files. Enter `-` to disable copies. Run **Backups and database > Create a backup** to test the copy; failures are logged and stop automatic local pruning. A local backup alone does not protect against VM/disk loss.

```bash
timesheet backup
timesheet backups
timesheet check-db
timesheet prune             # preview only
timesheet prune --confirm   # delete expired snapshots, preserving newest three
sudo docker image ls gcc-timesheet-recovery
sudo docker system df
df -h
```

For snapshots older than registry retention, separately save their Docker image to approved backup storage (`sudo docker save IMAGE_REFERENCE | gzip > image.tar.gz`). Recover it with `gunzip -c image.tar.gz | sudo docker load` before restoring. Local recovery tags are not copied into the snapshot.

## Restore and disaster recovery

Use **Backups and database > Restore a snapshot** to list and choose a snapshot, then confirm replacement. The tool verifies archive checksum, allowed paths, required files and SQLite integrity before replacing data. It pauses automatic app updates, makes a safety snapshot, restores the selected config/data/image, regenerates Nginx and checks startup. Auto-updates remain paused until you resume them. Web maintenance remains enabled after restore, including when recovering an older snapshot that had maintenance disabled. Once complete, open the website and sign in as an active System Admin from the restored database to release maintenance.

```bash
timesheet restore /var/backups/gcc-timesheet/timesheet-ACTUAL-FILENAME.tgz --confirm
timesheet status
timesheet check-db
```

Restoring replaces database, uploads, environment, selected ports/hostname and TLS material with that snapshot. Employee changes after the snapshot are lost. Restoring an old port requires that port still be available. The tool uses the retained image ID, or pulls its recorded immutable registry digest and checks the image ID. Recovery across CPU architectures requires an explicit migration rather than silently choosing a different image.

For a replacement VM: install this administrator, complete a temporary fresh app setup, copy a trusted snapshot and sidecar into `/var/backups/gcc-timesheet`, then restore it. Set ownership to root and permissions to 600 for copied files. Review the restored browser hostname/ports, TLS and environment before reopening access. Schedules are machine-specific and are not restored from app snapshots; configure them in **Automatic jobs > Configure schedules**. Preserve IT's OS/network settings and SSH backup keys separately. A backup from the earlier shell-only guide is not interchangeable with this administrator's format.

## Factory reset and maintenance release

Choose **Advanced maintenance > Factory reset all application data** for a clean application. The warning lists the data being deleted and requires the exact words `FACTORY RESET`. The CLI equivalent is `timesheet factory-reset --confirm`; omitting `--confirm` refuses the operation.

Reset pauses all automatic jobs, enables maintenance, stops the app, creates and checksums a full safety snapshot, and completes an off-VM copy when configured. A failed snapshot or copy aborts deletion. It then builds a fresh database and creates only **systemadmin@barry-wehmiller.com / systemadmin**, clears uploaded files and application logs, and starts the app in web maintenance. A failure attempts to restore the full safety snapshot. Backups, server hostname/ports/TLS, environment secrets and automatic startup preference are retained. SSO, SharePoint sync, Power Automate and the reporting API are disabled to keep the reset installation local-only. Automatic jobs stay paused until explicitly resumed.

The database-only safety copy is also saved in `/opt/gcc-timesheet/app-backup`; the complete snapshot path under `/var/backups/gcc-timesheet` is printed before data is reset. Use **Backups and database > Restore a snapshot** to recover it if needed. No existing deployment is silently erased during an upgrade.

Backup, restore and reset share the app's persisted maintenance file at `/opt/gcc-timesheet/data/.maintenance`. After the operation finishes, the Nginx gate is removed so the browser can show the existing **System admin login** page. Only a valid active System Admin can reopen employee access. Login and the web maintenance switch cannot release it while `/opt/gcc-timesheet/data/.maintenance-operation` exists. Health checks use `/api/health/live` and do not release maintenance.

If power loss interrupts a database operation, inspect `/var/log/gcc-timesheet-admin/admin.log` and database integrity before recovery. A leftover operation marker deliberately blocks release. After ensuring no administrator job is running, stop the app with **App control > Stop application**, remove only `/opt/gcc-timesheet/data/.maintenance-operation`, and use **App control > Start / apply saved settings**. The ordinary `.maintenance` file remains until System Admin web login. Retain the printed safety snapshot for recovery.

## Logs and troubleshooting

| Item | Location / command |
|---|---|
| Rotating administrator log | `/var/log/gcc-timesheet-admin/admin.log` |
| Rotated files | `admin.log.1` through `.10`, 5 MiB per file |
| Installer log | `/var/log/gcc-timesheet-admin/install.log`, 5 MiB rotation, five archives |
| Container output | `timesheet logs`; Docker rotation 10 MiB x 3 |
| Full diagnostics | `timesheet diagnostics` |
| Application settings | `/opt/gcc-timesheet/admin.json` |
| Private environment | `/opt/gcc-timesheet/.env` |
| Schedules and retention | `/etc/gcc-timesheet-admin/schedules.json` |
| Installed tool | `/usr/local/lib/gcc-timesheet-admin/releases/VERSION` |
| App data | `/opt/gcc-timesheet/data`, `uploads`, `logs`, `app-backup`, `tls` |

Administrator entries have timestamps, command names, results and Python tracebacks for failures. Log rotation is serialized across menu/timer processes. Password entry and the private environment editor are excluded from command logs; the tool never runs `docker inspect` without a restricted format or prints the full environment. Treat application logs as internal operational data.

```bash
sudo tail -n 150 /var/log/gcc-timesheet-admin/admin.log
sudo grep -nE 'ERROR|FAILED|Traceback' /var/log/gcc-timesheet-admin/admin.log
sudo docker logs --tail 200 timesheet-app
sudo nginx -t
sudo systemctl status docker nginx avahi-daemon --no-pager
sudo journalctl -u timesheet-update.service -n 100 --no-pager
systemctl --failed
```

- **Port occupied:** use **Logs and diagnostics > Server diagnostics** to identify listeners, then select another port in **Setup and configuration > Website address, ports and HTTPS**. Do not kill an unrelated service.
- **`.local` fails:** test from the same LAN, inspect Avahi and ask IT about mDNS/VLAN policy. Use normal company DNS across routed networks.
- **502/503:** inspect container logs and administrator log. After resolving the cause, **App control > Start / apply saved settings** starts the app and removes the temporary Nginx gate only after health succeeds. It never clears web maintenance; a System Admin signs in in the browser to release it.
- **Pull/download fails:** check outbound access, corporate proxy/CA and GitHub availability/rate limits. GHCR is public; if visibility becomes private, authenticate root with `sudo docker login ghcr.io` using a least-privilege token.
- **Disk full:** inspect backups and Docker usage. Preview retention cleanup; do not remove database directories or run volume pruning.
- **Interrupted setup:** use **Setup and configuration > Install / resume setup** or `timesheet resume-setup` after resolving the failure. Do not regenerate secrets.
- **Tool update fails:** the old version stays installed unless the switch completed. Check `timesheet --version`, inspect the log, and use **Application and tool updates > Roll back administrator** if needed.
- **A timer failed because another operation held the lock:** review the current job, then run the missed action manually. The next scheduled run will retry.

## Routine OS maintenance and complete CLI

Use **Advanced maintenance > Ubuntu / Docker package upgrades** for Ubuntu/Docker package upgrades. It pauses all three jobs, backs up first and reports whether the OS requests a reboot. It does not reboot automatically. After a planned reboot, verify the app and selectively resume jobs. Menu **App control > Startup after reboot** controls reboot startup. Enabled (the default) uses Docker's `always` restart policy and enables Docker/Nginx/Avahi at boot, so even an explicitly stopped container starts after the Docker daemon or OS restarts. Disabled uses restart policy `no`; it does not stop the currently running app. Use **App control > Start / apply saved settings** to start manually. This setting persists across ordinary app updates; restoring a snapshot restores its startup preference.

```bash
timesheet                 # grouped interactive panel
timesheet --plain         # ASCII panel without color/emoji
timesheet --version
timesheet setup
timesheet resume-setup
timesheet status
timesheet start
timesheet stop
timesheet restart
timesheet dependencies
timesheet avahi
timesheet firewall
timesheet logs
timesheet diagnostics
timesheet remove-bootstrap
timesheet os-maintenance
timesheet autostart enable
timesheet autostart disable
timesheet factory-reset --confirm
```

Backup/update/pause/restore/self-update commands are listed in their sections above. Menu-only configuration actions include network/TLS, interactive schedule editing, image-channel selection, the environment editor and retention/off-VM configuration. Timers invoke the same CLI operations with `--scheduled`; there is no separate maintenance implementation.

## Source, validation and future releases

The complete source of every production/packaging script is included in [SCRIPTS.md](SCRIPTS.md), generated directly from the shipped files. This prevents the reference from drifting from the code. GitHub publishes the guide, source reference, installer, tar bundle/checksum and ZIP for each administrator tag.

Maintainers run:

```bash
python3 -m unittest discover -s deploy/linux-admin/tests -p 'test_*.py' -v
python3 deploy/linux-admin/build_release.py
python3 deploy/linux-admin/build_release.py --check
```

The dedicated GitHub workflow runs failure-focused unit tests and an actual Ubuntu/Docker/Nginx installation, backup/restore, port-change, timer and command-installation smoke test on a disposable runner. For a future tool release, update `VERSION`, guide links and release notes; regenerate `SCRIPTS.md`; commit; push a matching `gcc-timesheet-linux-admin-vX.Y.Z` tag. The workflow verifies that tag against VERSION and publishes assets only after tests pass. It does not replace the repository's app or Power BI latest-release designation.

Before production acceptance on your VM, test browser login, sample save/submit/approval, trusted HTTPS, hostname access from actual employee networks, a scheduled backup, an off-VM copy if configured, and a restore on a test VM. Automated checks cannot validate your company's DNS, certificates, network firewall or backup credentials.

Sources: [Docker installation](https://docs.docker.com/engine/install/ubuntu/), [Avahi](https://avahi.org/), [GitHub releases API](https://docs.github.com/en/rest/releases/releases), [Python rotating log handlers](https://docs.python.org/3/library/logging.handlers.html).
