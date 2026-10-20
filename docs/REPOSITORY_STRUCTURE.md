# Repository and release mapping

## Products and boundaries

| Product | Source entry point | Version source | New release tag | Distribution |
| --- | --- | --- | --- | --- |
| GCC Timesheet App | [client](../client/), [API](../server/), [shared policies](../shared/) | [package.json](../package.json) | `gcc-timesheet-app-vX.Y.Z` | Existing GHCR image and optional Docker Hub copy |
| GCC Dashboard Power BI | [GCC_Dashboard_v2.2.2.pbip](../powerbi/GCC_Dashboard/GCC_Dashboard_v2.2.2.pbip) | API `dashboardVersion` and PBIP suffix | `gcc-dashboard-powerbi-vX.Y.Z` | `gcc-dashboard-powerbi-vX.Y.Z.zip` |
| GCC Timesheet Linux Admin | [manager.py](../deploy/linux-admin/manager.py) | [VERSION](../deploy/linux-admin/VERSION) | `gcc-timesheet-linux-admin-vX.Y.Z` | `gcc-timesheet-linux-admin.tar.gz` and `.zip` |

The reporting API version is separate from app/dashboard versions. PBIR and linguistic schema versions are format identifiers, not release versions.

## Folder layout

```text
gcc_ts/
  client/                  React frontend and lockfile
  server/                  Express API, migrations, and lockfile
  shared/                  Policies consumed by both application layers
  deploy/linux-admin/      Ubuntu installer, administrator, tests, packaging
  powerbi/
    GCC_Dashboard/         Active PBIP, Report, and SemanticModel siblings
    documentation/        Dashboard connection, model, development guides
    legacy/               Retained standalone models, queries, assets
    validation/           Dated validation evidence and schema cache
  scripts/                Regression tests and maintenance/Power BI tooling
  docs/
    integrations/         Optional Microsoft 365 setup
    archive/              Historical implementation and migration plans
  .github/
    HELP.md               Repository operations and support
    workflows/            Application, container, Linux-admin workflows
  .agents/                Vendored skills and upstream licenses
```

Root Docker files, manifests, launchers, `AGENTS.md`, and responsive rules remain at their established locations. Runtime `client/`, `server/`, and `shared/` paths are preserved because imports, Express static serving, Docker stages, and launchers depend on them.

## Moved paths

| Previous location | Current location |
| --- | --- |
| `powerbi/GCC_Requirements/` | `powerbi/GCC_Dashboard/` |
| `GCC_Requirements*.pbip`, `.Report`, `.SemanticModel` | Corresponding `GCC_Dashboard*` names |
| `deploy/ubuntu/` | `deploy/linux-admin/` |
| `.github/workflows/timesheet-admin.yml` | `.github/workflows/linux-admin.yml` |
| Root API, architecture, deployment guides | `docs/` |
| Root SharePoint, Power Automate, Power BI setup guides | `docs/integrations/` |
| Root migration plan, implementation plan, project overview | `docs/archive/` |

Keep each PBIP together with its Report and SemanticModel siblings. Close Desktop before pulling a path reorganization; reopen the versioned PBIP afterward. `.platform` logical IDs and TMDL lineage identifiers are retained.

## Release compatibility and history

Published tags and commit targets are preserved. Historical `vX.Y.Z`, `powerbi-vX.Y.Z`, and `timesheet-admin-vX.Y.Z` tags receive matching aliases under the new product prefixes. Existing releases retain their historical tag and URL so installed tools and saved links continue to work; titles use current product names. New releases use the product-prefixed tags above.

Canonical asset names are added beside legacy filenames. Historical archives retain their original bytes and internal filenames; matching SHA-256 sidecars identify the canonical download name. Existing checksums and assets remain available. Historical source archives reflect the original commit layout. Use a current checkout for the current folder structure.

The Linux admin accepts both release-tag prefixes. Its stable `timesheet` command, archive root `timesheet-admin/`, `/opt/gcc-timesheet` data directory, `/usr/local/lib/gcc-timesheet-admin` installation directory, schedules, logs, and backups stay compatible with installed systems. The repository name, GHCR path, database names, API routes, SharePoint site examples, and integration keys remain stable identifiers.

## Cleanup policy

Removed: tracked client/server PID files and unused React/Vite logo assets. These contain no source or configuration. The client README now documents this application instead of the starter template; the browser favicon uses the company logo.

Retained: historical plans, legacy Power BI artifacts, skills/licenses, source/configuration, and the tracked historical database backup. A backup is not assumed obsolete merely because it is old. PID files, Python caches, and build outputs are ignored; backups, backend environment files, and companion products are excluded from the application Docker context.

Git history is not rewritten. Existing working-tree edits are carried to their new locations. See [the validation record](REORGANIZATION_VALIDATION.md) for migration results and limits.

## Validate future changes

```sh
npm run check:repository
npm test
npm run lint
npm run build
python deploy/linux-admin/build_release.py --check
node scripts/validate-powerbi.js
npm run graph:build
git diff --check
```

Run Linux behavioral/deployment checks on Ubuntu as described in [its guide](../deploy/linux-admin/README.md). The Power BI schema check requires local Desktop/TOM prerequisites. Static checks do not certify live Desktop rendering or refresh.
