# GCC project help

Installation, GitHub workflows, releases, and troubleshooting for **GCC Timesheet App**, **GCC Dashboard Power BI**, and **GCC Timesheet Linux Admin**.

[Set up](#1-choose-your-setup) · [Configure](#2-configure-the-application) · [Validate](#3-validate-a-change) · [GitHub Actions](#4-github-actions) · [Releases](#5-releases-and-downloads) · [Troubleshoot](#6-troubleshooting) · [Get help](#7-report-a-problem)

## 1. Choose your setup

| Goal | Follow this guide | Source location |
| --- | --- | --- |
| Run or develop GCC Timesheet App | [Application README](../README.md#getting-started) | `client/`, `server/`, `shared/` |
| Deploy and maintain an Ubuntu server | [GCC Timesheet Linux Admin](../deploy/linux-admin/README.md) | `deploy/linux-admin/` |
| Open and configure the dashboard | [GCC Dashboard Power BI](../powerbi/README.md) and [connection guide](../powerbi/documentation/POWERBI_USER_GUIDE.md) | `powerbi/GCC_Dashboard/` |
| Find technical reference material | [Documentation index](../docs/README.md) | `docs/`, `powerbi/documentation/` |
| Understand renamed paths and compatibility | [Repository and release mapping](../docs/REPOSITORY_STRUCTURE.md) | All three products |

### Local application development

From the repository root:

```sh
npm ci --ignore-scripts
npm --prefix server ci
npm --prefix client ci
```

Copy the [root environment example](../.env.example) to `server/.env`. Configure the bootstrap account and secrets before running:

```sh
npm run setup
npm run dev:server
```

In a second terminal, run `npm run dev:client`. Open the Vite URL (normally port 5173); the development proxy sends API requests to port 3001. The server and client commands work in PowerShell, macOS, and Linux terminals.

For production containers, use [Docker deployment](../README.md#docker-deployment) or the Linux-admin guide. Keep existing database volumes and backups when upgrading.

## 2. Configure the application

| Context | Configuration | Key points |
| --- | --- | --- |
| Local API | `server/.env` | JWT secrets, bootstrap account, database path, integrations |
| Local frontend | `client/.env` | Public `VITE_ENTRA_*` settings only |
| Root Docker Compose | Root `.env` | Container configuration; Compose sets production mode, port, database location |
| Linux-admin installation | Managed `/opt/gcc-timesheet/.env` | Follow the administrator menu; preserve its data directories |
| GitHub Actions | Repository Actions secrets/variables | Registry publishing credentials and policy |

1. Set `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters before first setup. Remove both after provisioning and restart. Bootstrap settings do not reset existing passwords.
2. Set independent JWT secrets of at least 32 characters for production. Use exact allowed origins and the HTTPS cookie settings appropriate to the deployment.
3. Preserve the database path/volume and take a recoverable backup before changing deployment settings.
4. Validate Compose with `docker compose config --quiet`. The non-quiet command may expose resolved secrets.
5. Rebuild the frontend after changing public Vite settings; runtime environment changes do not rewrite an existing frontend bundle.

## 3. Validate a change

Run from the root:

```sh
npm run check:repository
npm test
npm run lint
npm run build
git diff --check
```

The mapping check validates repository-owned documentation links, package names/lockfiles, product entry points, and moved paths. Tests exercise application behavior and reporting APIs with isolated data. See [script guidance](../scripts/README.md) for Power BI and Linux checks. A passing build does not replace a live deployment smoke test.

UI changes must also pass the [responsive rules](../RESPONSIVE_WEB_DESIGN_RULES.md) and [Chromium checklist](../docs/CHROMIUM_LAYOUT_TEST_CHECKLIST.md). Record actual checks and limits in the [responsive audit](../docs/RESPONSIVE_AUDIT.md).

## 4. GitHub Actions

[Open Actions](https://github.com/naveenbarrywehmiller/gcc_ts/actions). The workflow files are the source of truth for triggers, permissions, and job names.

| Workflow | Runs when | Result |
| --- | --- | --- |
| [Repository validation](workflows/validate.yml) | Main pushes, pull requests, manual dispatch | Mapping check, application tests, lint, frontend build |
| [Release Please](workflows/release-please.yml) | Push to `main` | Application release PRs, versions, changelog, product-prefixed tags |
| [Build & Publish Docker Image](workflows/docker-build.yml) | Main pushes, application tag pushes, main PRs, manual dispatch | AMD64/ARM64 validation; non-PR events publish a combined image |
| [GCC Timesheet Linux Admin](workflows/linux-admin.yml) | Relevant main pushes/PRs, administrator tags, manual dispatch | Syntax/unit/package checks and actual Ubuntu/Docker/Nginx smoke test; tagged builds publish admin assets |

Repository administrators must allow the referenced actions and, where policy permits, allow GitHub Actions to create pull requests. Release Please needs contents/pull-request write permissions; container publishing needs package write permissions. Branch protection and required-check settings are managed in GitHub, separately from source files.

### Container registry configuration

The existing image address is stable:

```text
ghcr.io/naveenbarrywehmiller/gcc_ts
```

| Build | Tags |
| --- | --- |
| Main | `main`, `latest`, short SHA, `v<package-version>`, `<package-version>` |
| New application tag | Full `gcc-timesheet-app-vX.Y.Z` tag and normalized `X.Y.Z` |
| Legacy `vX.Y.Z` tag | Full tag, `X.Y.Z`, `X.Y`, short SHA; metadata may emit `latest` |
| Pull request | Validation only; no publishing |

Inspect metadata from the specific run for exact tags. Mutable tags can be replaced; deploy a verified digest when an immutable reference is needed. Private images require package-read credentials.

Optional Docker Hub publishing uses:

| Type | Name | Purpose |
| --- | --- | --- |
| Variable | `DOCKERHUB_USERNAME` | Nonempty enables the copy job |
| Secret | `DOCKERHUB_TOKEN` | Access to the destination repository |
| Optional variable | `DOCKERHUB_IMAGE` | Lowercase `namespace/repository`; defaults to `<username>/gcc_ts` |

Create the destination repository before enabling publishing. The copy job transfers the completed multi-platform GHCR manifest by digest. A failed Docker Hub job does not undo a successful GHCR publish.

### Manually publish an existing application revision

1. Open **Actions → Build & Publish Docker Image → Run workflow**.
2. Select the intended branch or existing application release tag.
3. Wait for both architecture builds and the manifest merge.
4. Check the optional Docker Hub copy separately.
5. Verify the resulting image/digest and deployed `/api/health` version.

Release Please uses `GITHUB_TOKEN`. Tag events created by that token do not guarantee another workflow run. If a release has no matching image, inspect the main build first, then dispatch Docker **on the existing release tag** if needed.

## 5. Releases and downloads

[Browse releases](https://github.com/naveenbarrywehmiller/gcc_ts/releases).

| Product | Version source | New tag | Download |
| --- | --- | --- | --- |
| GCC Timesheet App | Root `package.json` | `gcc-timesheet-app-vX.Y.Z` | Container image or GitHub source archive |
| GCC Dashboard Power BI | API `dashboardVersion` and PBIP suffix | `gcc-dashboard-powerbi-vX.Y.Z` | `gcc-dashboard-powerbi-vX.Y.Z.zip` and checksum |
| GCC Timesheet Linux Admin | `deploy/linux-admin/VERSION` | `gcc-timesheet-linux-admin-vX.Y.Z` | Tar/ZIP, checksum, installer, guides |

Use conventional commit subjects such as `feat: add vacation planning` or `fix: correct approval scope`; review generated version/changelog changes before merging a release PR. Documentation-only commits do not necessarily trigger an app release.

Historical releases retain their original tags and URLs, with canonical tag aliases and asset names added. Old checksums and downloads remain valid. Historical archives keep their original internal layout; use the current checkout for renamed source folders. See [compatibility details](../docs/REPOSITORY_STRUCTURE.md#release-compatibility-and-history).

For Linux administration, use the published installer and verify its guide. App releases, dashboard releases, and Linux-admin releases have independent versions; never choose an administrator update using the repository's overall “latest release.”

## 6. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| No first login | Check bootstrap email/password in the correct environment file, run setup, inspect provisioning errors. No default production password is provided. |
| Bootstrap password change has no effect | Provisioning is one-time. Use authorized account recovery for existing users. |
| Production refuses to start | Supply both JWT secrets with at least 32 characters and inspect the startup error. |
| Login immediately returns to login | Check HTTPS/`COOKIE_SECURE`, exact CORS origin, and proxy scheme forwarding. |
| Local frontend API failure | Start API on port 3001 or update Vite's proxy; use port 5173 for the frontend. |
| Microsoft sign-in unavailable/fails | Check backend feature flags, tenant/client agreement, public Vite settings, redirect origin, and permissions; rebuild/restart as needed. |
| Power BI returns 401/403 | Enable reporting, configure the dedicated API key, and use supported credentials. Follow the dashboard connection guide. |
| Power BI data delayed | Check cache/refresh state; `POWERBI_CACHE_TTL=0` currently falls back to 60 seconds. |
| Renamed PBIP cannot find its model | Keep Report and SemanticModel siblings together; close Desktop and reopen the versioned PBIP. Avoid mixing old/new folders. |
| Model validation cannot run | Install the local Desktop/TOM prerequisites described in [Power BI validation](../powerbi/validation/README.md). |
| API returns 429 | Wait for the rate-limit window and inspect request loops before changing limits. |
| Health/API returns 503 | Check maintenance mode. `/api/health/live` remains the liveness endpoint. |
| Database empty after upgrade | Confirm the same mounted volume/path. Inspect backups before changing data or seeding. |
| CLI backup lacks sqlite3 | Install the CLI for online snapshots or stop the server before file-copy fallback; prefer the online system-admin download. |
| GHCR push denied | Check package-write permission, package association/access, and Actions policy. |
| Docker Hub copy fails | Check variable/secret names, token access, destination existence, and lowercase image name. |
| ARM image absent | Check the ARM build and combined-manifest merge; a single successful build is insufficient. |
| Release and deployed versions differ | Verify image digest/tag, pull/recreate result, and `/api/health`; `latest` can change. |
| Linux-admin update not found | Check stable releases under either admin prefix and the dedicated asset/checksum. App/Power BI tags are intentionally ignored. |

## 7. Report a problem

Include:

- Product and version; for the app, use `/api/health` if maintenance permits it.
- Deployment type, operating system/CPU architecture, browser, and relevant runtime versions.
- User role, affected screen, reproduction steps, expected result, and actual result.
- Sanitized error text/status or the Actions run link and failing job.
- The preceding upgrade, configuration change, or restore, if any.

Remove cookies, tokens, API keys, passwords, webhook signatures, and personal/customer data. Use your organization's private support channel for sensitive problems; the repository does not specify a public security-reporting address.

## Reference library

[Documentation index](../docs/README.md) · [API](../docs/API_REFERENCE.md) · [Architecture](../docs/ARCHITECTURE.md) · [App changelog](../CHANGELOG.md) · [Power BI changelog](../powerbi/CHANGELOG.md) · [Linux operations](../deploy/linux-admin/README.md)
