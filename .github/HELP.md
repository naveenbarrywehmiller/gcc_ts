# GitHub and application help

Use this guide for repository setup, GitHub Actions, container publishing, and common application problems. Start with the [main README](../README.md) for installation and features.

## Quick links

- [Source repository](https://github.com/naveenbarrywehmiller/gcc_ts)
- [Actions](https://github.com/naveenbarrywehmiller/gcc_ts/actions)
- [Releases](https://github.com/naveenbarrywehmiller/gcc_ts/releases)
- [Changelog](../CHANGELOG.md)
- [Docker workflow](workflows/docker-build.yml)
- [Release workflow](workflows/release-please.yml)

## Configuration checklist

| Context | Environment file | Important details |
| --- | --- | --- |
| Local backend | `server/.env` | JWT secrets, bootstrap account, database, integrations |
| Local frontend | `client/.env` | Public `VITE_ENTRA_*` settings only |
| Docker Compose | Root `.env` | Passed into container; Compose overrides production mode, container port, and database location |
| GitHub Actions | Repository Actions secrets/variables | Registry publishing settings; never commit tokens |

Before first login, configure `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters. After provisioning, remove both values and restart/recreate as applicable. Existing credentials are not reset by changing the bootstrap values.

Before a production rollout, generate independent JWT secrets, set exact CORS origins, confirm HTTPS cookie settings, preserve database storage, and download a recoverable backup. Check effective Compose configuration with `docker compose config --quiet`; the non-quiet form may print secrets.

## GitHub Actions configuration

Two workflows are currently present:

| Workflow | Trigger | Result |
| --- | --- | --- |
| Release Please | Push to `main` | Updates release PRs and creates releases from eligible merged changes |
| Build & Publish Docker Image | Main pushes, `v*` tag pushes, PRs targeting main, manual dispatch | Builds AMD64/ARM64 images; publishes only for non-PR events |

Repository administrators should confirm Actions are enabled and permitted to use the referenced actions. Under **Settings → Actions → General**, allow GitHub Actions to create pull requests if required by repository policy. Release Please requests contents and pull-request write permissions. Docker publishing requests package write permissions.

Branch protection, required checks, package visibility, and live repository settings are not encoded entirely in these files. The checked-in workflows do not automatically run the application's regression tests or frontend lint; run `npm test`, `npm run lint`, and `npm run build` before merging. Adding those jobs and requiring them is a possible future improvement.

### Manual Docker build

1. Open **Actions → Build & Publish Docker Image**.
2. Choose **Run workflow** and select `main` or the intended existing release tag.
3. Wait for both architecture builds, then the manifest merge.
4. If Docker Hub is enabled, check its copy job separately.
5. Review published tags and verify the deployed `/api/health` version.

A successful architecture build alone does not mean the multi-platform tag was published: the merge job must also succeed.

## Container registries

### GitHub Container Registry

The image name is derived from the GitHub repository. For this repository it is:

```text
ghcr.io/naveenbarrywehmiller/gcc_ts
```

| Build source | Tags configured by the workflow |
| --- | --- |
| `main` | `main`, `latest`, short commit SHA, `v<package-version>`, `<package-version>` |
| Semantic version tag such as `v1.2.3` | `1.2.3`, `1.2`, short commit SHA; Docker metadata may also provide its automatic `latest` tag |
| Pull request | Build validation only; no registry publishing |

`latest` and version tags emitted from main can be overwritten by later builds. Use a verified image digest for immutable deployment references. See the workflow's metadata output for the exact tags of a particular run.

If a package is private, authenticate with a token permitted to read that package. Use password-stdin or a credential helper; do not paste a token into commands saved in shell history. Package access and visibility are managed separately from this documentation. See [GitHub's container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

### Optional Docker Hub copy

Configure **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
| --- | --- | --- |
| Variable | `DOCKERHUB_USERNAME` | Docker Hub login account; nonempty enables publishing |
| Secret | `DOCKERHUB_TOKEN` | Token with permission to read/write the destination repository |
| Variable, optional | `DOCKERHUB_IMAGE` | Lowercase `namespace/repository`; default is `<username>/gcc_ts` |

Create the destination Docker Hub repository with the desired visibility before enabling the copy. For organizations, grant the login account access and set `DOCKERHUB_IMAGE` accordingly.

The job copies all platforms and the generated tags from the completed GHCR manifest digest. A missing/invalid token fails this job visibly; the already-published GHCR image remains available. Without `DOCKERHUB_USERNAME`, the job is skipped. Pull-request builds do not publish.

## Releases

Use conventional commit subjects such as `feat: add vacation planning`, `fix: correct approval scope`, and `docs: update setup guide`. Release Please decides release eligibility from commit metadata; documentation-only changes do not necessarily create a release.

Review the generated release PR, including version and changelog changes, before merging. The root `package.json` is the application version source; health responses add a `v` prefix.

### A release exists but its image did not build

Release Please currently uses the default repository `GITHUB_TOKEN`. Events generated by that token generally do not start another workflow; tag creation therefore does not guarantee a Docker run. See [GitHub's token event behavior](https://docs.github.com/en/actions/concepts/security/github_token).

The merged main push may have published the package version already. Check Docker workflow runs and GHCR tags first. If the intended release image is absent, manually dispatch the Docker workflow **on that existing release tag**, then verify the result. Using a GitHub App token or explicit dispatch from the release workflow could automate this later, but that is not configured here.

## Troubleshooting

| Symptom | Checks and resolution |
| --- | --- |
| No login works after fresh setup | Set both bootstrap values in the correct environment file, run setup/start, and inspect provisioning errors. There is no default production password. |
| Bootstrap password change does nothing | Provisioning is one-time. Use an authorized user-management/recovery process for existing accounts. |
| Production refuses to start | Supply both JWT secrets with at least 32 characters; inspect the startup error. Do not retain example strings. |
| Login succeeds but browser returns to login | Check `COOKIE_SECURE`: true requires HTTPS. Confirm the actual browser origin is in `CORS_ORIGIN` and the proxy forwards the correct scheme. |
| Frontend API requests fail locally | Start API on port 3001 or update Vite's proxy target; access the frontend on 5173. |
| SSO button is absent | Configure backend feature flag/IDs and frontend `VITE_ENTRA_*`; restart/rebuild the client. Runtime Compose variables do not alter an existing frontend build. |
| Microsoft login rejects a token | Check tenant/client ID agreement, registered redirect origin, account permissions, and server validation logs. |
| Power BI returns 401/403 | Confirm reporting is enabled, the dedicated API key is configured, and the client sends supported credentials. Employee JWTs do not grant admin reporting access. |
| Power BI data appears delayed | Check the reporting cache TTL and refresh status. `POWERBI_CACHE_TTL=0` currently uses 60 seconds. |
| API returns 429 | Wait for the configured rate-limit window; inspect request loops and load before increasing limits. |
| Health/API returns 503 | Check maintenance mode in the system-admin workflow. Maintenance deliberately blocks health and most APIs. |
| Database appears empty after update | Confirm the same database path and volume are mounted. Do not seed over or remove a volume before checking existing storage/backups. |
| CLI backup says sqlite3 unavailable | Install the CLI for online snapshots or stop the server before using the file-copy fallback; prefer the system-admin online download. |
| GHCR push is denied | Check workflow package-write permissions, package repository association/access, and organization Actions policy. |
| Docker Hub job fails | Confirm variable/secret names, token permission, destination existence, and lowercase image name. GHCR may still be successful. |
| ARM image missing | Check the ARM runner build and manifest merge; verify the workflow run's multi-platform manifest. |
| Released version differs from deployed version | Check the deployed image digest/tag, main package version, pull/recreate result, and `/api/health`; `latest` may reference a different build. |
| Power BI Desktop model validation cannot run | Follow the separate Power BI validation prerequisites; these checks require the relevant local model/engine setup. |

## Reporting a problem

Include enough information for someone to reproduce it:

- Application version from `/api/health`, or explain if maintenance blocks it.
- Deployment type, OS/CPU architecture, browser, and local Node version if relevant.
- User role, affected screen, steps, expected outcome, and actual outcome.
- Sanitized error text, request status, or the relevant Actions run link/job name.
- Whether the problem began after a release, configuration change, or database restore.

Remove cookies, bearer tokens, API keys, passwords, webhook signatures, and personal/customer data. For sensitive problems, use your organization's private support channel. This repository does not declare a public security-reporting address.

## Further reading

[Main setup and features](../README.md) · [API](../API_REFERENCE.md) · [Deployment history](../DEPLOYMENT_NOTES.md) · [Power BI integration](../docs/POWERBI.md) · [Power BI project](../powerbi/POWERBI.md)
