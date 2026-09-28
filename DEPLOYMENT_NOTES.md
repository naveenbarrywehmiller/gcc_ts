# 🛠️ Deployment & Architecture Fixes Log

This document records the infrastructure, Docker, CI/CD, and platform compatibility fixes applied to **GCC TimeSheet**.

---

## 📋 Table of Contents
1. [Multi-Architecture Docker Builds (`linux/arm64` + `linux/amd64`)](#1-multi-architecture-docker-builds)
2. [C++ Native Module Segfault Resolution (`better-sqlite3`)](#2-c-native-module-segfault-resolution)
3. [Raspberry Pi (DietPi) Setup & Auto-Refresh](#3-raspberry-pi-dietpi-setup--auto-refresh)
4. [Dual Tailscale Funnels (Timesheet + OmniRoute)](#4-dual-tailscale-funnels)
5. [Dynamic Release Versioning & Removal of Hardcoded Year](#5-dynamic-release-versioning)
13. [CI/CD Race Condition & Image Manifest Overwrite Fix](#6-cicd-race-condition--image-manifest-overwrite-fix)
14. [System Admin & Maintenance Mode Setup](#7-system-admin--maintenance-mode-setup)

---

## 1. Multi-Architecture Docker Builds

### Problem
The initial Docker images were built exclusively for `linux/amd64`. Running these containers on ARM64 hardware (such as Raspberry Pi 3/4/5 or Apple Silicon) either failed completely or required slow QEMU emulation.

### Solution
Updated `.github/workflows/docker-build.yml` to utilize GitHub Actions matrix builds running **natively** on:
- `ubuntu-latest` for **`linux/amd64`**
- `ubuntu-24.04-arm` for **`linux/arm64`**

Both platform slices push individual digests, and a subsequent `merge` job creates an OCI multi-architecture manifest list. Docker automatically pulls the native architecture for the host machine.

---

## 2. C++ Native Module Segfault Resolution

### Problem
When the container was launched on ARM64 Raspberry Pi (DietPi), Node.js crashed with a `Segmentation fault` during database migrations (`node src/config/migrate.js`).

### Root Causes
1. **C Runtime Incompatibility (`musl` vs `glibc`)**: The original base image was `node:20-alpine`. The `better-sqlite3` native C++ addon compiled on Alpine uses `musl libc`, which causes severe ABI incompatibilities and crashes on Debian-based ARM64 systems.
2. **Node.js ABI Mismatch**: `better-sqlite3` v13 specifies engine requirements `node >= 22`. Running v13 under Node.js 20 caused binary ABI collisions.

### Solution
Updated [`Dockerfile`](./Dockerfile) from `node:20-alpine` to **`node:22-bookworm-slim`** (Debian GNU/Linux):
- `better-sqlite3` now compiles against standard `glibc`.
- Node.js 22 matches the native module's ABI requirements.

---

## 3. Raspberry Pi (DietPi) Setup & Auto-Refresh

### Deployment Path
The application is deployed on DietPi at `/opt/gcc_ts`:
- **Docker Compose File**: `/opt/gcc_ts/docker-compose.yml`
- **Data Persistence**: 
  - SQLite database: `/opt/gcc_ts/data/timesheet.db`
  - Uploads: `/opt/gcc_ts/uploads`
  - Backups: `/opt/gcc_ts/backup`

### Auto-Refresh on Release
The container is labeled for Watchtower:
```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
```
The existing Watchtower service checks the GitHub Container Registry (`ghcr.io/naveenbarrywehmiller/gcc_ts:latest`) every 5 minutes and automatically restarts the container with zero downtime whenever a new release is pushed.

---

## 4. Dual Tailscale Funnels

### Problem
Both GCC Timesheet (port `3001`) and OmniRoute (port `20128`) needed to be publicly accessible through Tailscale on the same DietPi node.

### Solution
Configured two independent HTTPS Tailscale Funnels on different ports:

| Service | Internal Port | Public Tailscale URL |
|---|---|---|
| **GCC Timesheet** | `3001` | **`https://dietpi.tail4f2b8f.ts.net`** (port 443) |
| **OmniRoute** | `20128` | **`https://dietpi.tail4f2b8f.ts.net:8443`** (port 8443) |

Funnels run persistently in the background (`--bg`) and automatically resume across system reboots.

---

## 5. Dynamic Release Versioning

### Problem
The footer and login page previously displayed a hardcoded year: `&copy; 2026 TimeSheet`. The requirement was to remove the hardcoded year and instead display the live GitHub release version (e.g. `v1.7.1`).

### Solution
1. **Frontend Updates**:
   - [`client/src/components/layout/Footer.jsx`](./client/src/components/layout/Footer.jsx): Replaced hardcoded text with `&copy; TimeSheet` and a badge displaying the version received from `/api/health`.
   - [`client/src/pages/Login.jsx`](./client/src/pages/Login.jsx): Added release version tag to the bottom info line.
2. **Backend Version Endpoint**:
   - Added [`server/src/config/version.js`](./server/src/config/version.js) to resolve the release version from root `package.json`.
   - Updated `/api/health` in [`server/src/index.js`](./server/src/index.js) to return `{ status: 'ok', timestamp: '...', version: 'v1.7.1' }`.
3. **Docker Image Packaging**:
   - Updated [`Dockerfile`](./Dockerfile) production stage to copy the root [`package.json`](./package.json) into `/app/package.json` so the server can read the release version inside the container.

---

## 6. CI/CD Race Condition & Image Manifest Overwrite Fix

### Problem
After pushing the version fix, DietPi failed to pull the `latest` image with:
```
no matching manifest for linux/arm64/v8 in the manifest list entries: not found
```

### Root Cause
Two CI workflows triggered in parallel upon merging release pull requests:
1. `.github/workflows/docker-build.yml` built and published the multi-architecture image (`arm64` + `amd64`).
2. `.github/workflows/release-please.yml` contained an outdated, single-arch `docker-build` job that only ran on `ubuntu-latest` (AMD64 only).
3. The single-arch job finished last and **overwrote the `:latest` tag on GHCR with an AMD64-only manifest**, removing the ARM64 platform slice.

### Solution
1. **Cleaned `release-please.yml`**: Removed the redundant single-arch `docker-build` job so `release-please` exclusively handles changelogs, tags, and GitHub releases.
2. **Enhanced `docker-build.yml`**:
   - Added checkout and package version extraction steps to the `merge` job.
   - Configured `docker/metadata-action` to tag both `:latest` and `:v${version}` (`v1.7.1`) as full multi-arch manifests.
   - Pushes verified unified multi-architecture manifests supporting both `linux/amd64` and `linux/arm64`.

---

## 7. System Admin & Maintenance Mode Setup

### Feature Additions
1. **System Admin Role**:
   - Added `system admin` to the SQLite `role` column `CHECK` constraints.
   - New installations provision the first system admin from the one-time
     `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` environment values.
     No predictable default account is created. Existing installations keep
     their current accounts and should replace any former default password.
2. **Dedicated Admin UI**:
   - Built a secure frontend page at `/admin/system` strictly accessible by `system admin` accounts.
3. **Maintenance Mode**:
   - Exposes a toggle to enable/disable system-wide maintenance mode.
   - Instantly drops an empty `.maintenance` file in the root.
   - The Express middleware immediately returns HTTP 503 for all standard `/api/*` endpoints except the `/api/system/*` routes used by the maintenance UI.
4. **Database Tools**:
   - Allows triggering the `npm run backup` and `npm run restore` backend scripts directly via the UI.
5. **API Token Generator & REST Links**:
   - Form generates dedicated JWT tokens with custom expirations (`1h`, `1d`, `30d`, or `never`) explicitly for REST API authentication (e.g. for external Raspberry Pi ingestion).
   - Embedded a reference table matching `API_REFERENCE.md` directly into the web UI for quick integrations.
