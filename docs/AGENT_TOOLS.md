# Development skills and code maps

GCC Timesheet App uses selected workflows from the three repositories below as development tools. Skills live in `.agents/skills/` and load when relevant. Graphify runs separately from the React/Express application. No npm runtime dependency is added.

## Included tools

| Upstream | Included | Purpose |
| --- | --- | --- |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | `ponytail`, `ponytail-review`, `ponytail-audit` | Reuse existing code, keep changes small, review connected code and audit architecture |
| [Agent Skills](https://github.com/addyosmani/agent-skills) | `frontend-ui-engineering`, `security-and-hardening`, `api-and-interface-design` | Accessible responsive UI, trust boundaries and stable API contracts |
| [Graphify](https://github.com/Graphify-Labs/graphify) | `graphify` skill, its references and pinned CLI | Local code relationship graph with query, path and explain commands |

The shared accessibility and security checklists from Agent Skills are in `.agents/references/`; the security skill also retains its own hardening reference. The relative reference paths therefore resolve after a per-skill installation.

Project skills are available on the next Codex turn. For example:

- "Use ponytail-review to review this change."
- "Use ponytail-audit to inspect the timesheet approval flow."
- "Use frontend-ui-engineering for this form and validate all project viewports."
- "Use security-and-hardening to review authorization on this endpoint."
- "Use api-and-interface-design when extending the reporting API."

Load only workflows relevant to the task. `AGENTS.md` and user instructions take precedence over upstream defaults. Existing task authorization still applies. TypeScript and framework examples in the skills do not change this project's JavaScript stack, existing API responses or component conventions. The permanent responsive rules and 28-viewport checklist remain required for UI changes.

## Build and query the code map

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) if it is unavailable. Node/npm is already required by the application. Run from the repository root:

```powershell
npm run graph:build
npm run graph:query -- "timesheet approval permissions" --budget 1200
npm run graphify -- explain "TimesheetRepository"
npm run graphify -- path "TimesheetRepository.js" "db.js"
```

The wrapper uses `uvx --python 3.12 --from graphifyy==0.9.92 graphify`. On the first run, uv downloads Python 3.12 if needed and installs the CLI in an isolated cache. This needs internet access for package downloads. The official package is **graphifyy**, with two trailing `y` characters; its command is `graphify`.

`graph:build` runs `extract . --code-only --max-workers 4`, then `cluster-only . --no-label` to generate the report and viewer without LLM naming. Extraction parses source locally and requires no LLM key. It produces:

```text
graphify-out/graph.json        Relationship data
graphify-out/GRAPH_REPORT.md   Architecture overview
graphify-out/graph.html        Interactive local graph
```

Open `graphify-out/graph.html` in a browser to explore it. Queries and builds can be repeated after source changes. The generated directory is local, ignored by Git and excluded from Docker builds. Each checkout builds its own map.

Use specific labels or `path/to/file::symbol` for ambiguous names. For example, `db` occurs in many files, whereas `db.js` identifies the database module. Broad queries may be truncated to their token budget; narrow the question or use a seed rather than assuming the returned nodes are exhaustive.

`.graphifyignore` excludes environment files, databases, uploads, backups, logs, dependencies, generated output, vendored skills, package lockfiles and the generated Power BI project. Power BI generation/validation scripts are still included. Code-only extraction does not semantically interpret documents or media. Dynamic routing, runtime SQL behavior, role checks and JSX relationships may be incomplete: confirm answers against source and tests. A graph cannot certify correctness or security.

The Graphify skill is upstream documentation with Bash and optional semantic extraction examples. For this repository, use the pinned npm commands instead of those installation/build examples. Semantic extraction, cloud services, hooks, global settings and background watchers are outside the default setup.

## Upstream versions and licenses

Imported on October 20, 2026:

| Source | Pinned revision | License files retained |
| --- | --- | --- |
| Ponytail 5.3.2 | [`09c434ab73ca43761c5d8b0c5d341926c2fba710`](https://github.com/DietrichGebert/ponytail/tree/09c434ab73ca43761c5d8b0c5d341926c2fba710) | [MIT](../.agents/licenses/ponytail/LICENSE) |
| Agent Skills | [`aeac41d4d005999432bb7312f7ff06383a91d59d`](https://github.com/addyosmani/agent-skills/tree/aeac41d4d005999432bb7312f7ff06383a91d59d) | [MIT](../.agents/licenses/agent-skills/LICENSE) |
| Graphify CLI/skill 0.9.92 | [`86c57be8204673c2a1b9849a3292a7dd3ab373d8`](https://github.com/Graphify-Labs/graphify/tree/86c57be8204673c2a1b9849a3292a7dd3ab373d8), PyPI `graphifyy==0.9.92` | [Apache-2.0](../.agents/licenses/graphify/LICENSE), [original MIT](../.agents/licenses/graphify/LICENSE-MIT), [NOTICE](../.agents/licenses/graphify/NOTICE) |

Skill contents and references are vendored from those sources; Graphify's Codex skill is stored under `.agents/skills/graphify/` alongside the other project skills. Project-specific overrides live in `AGENTS.md`, not in upstream skill text. These third-party licenses apply to the imported material; GCC Timesheet App's existing usage terms remain in its README.

To update, review an explicit upstream revision, replace the selected skill directories and their referenced checklists together, retain license notices, update the table and CLI pin, then run a build and representative queries. Do not rerun a general plugin installer over `AGENTS.md`: an installer can add hooks and overwrite the project-specific graph guidance.

## Setup validation

On October 20, 2026, the local build produced 1,526 nodes, 3,449 edges and 90 communities. Query and explain commands worked, and the path example above resolved the repository module's import of `db.js`. The extraction and report recorded zero LLM tokens. Some source/configuration files yielded no symbols; this is a partial static map.

Checks confirmed seven valid skill manifests, all referenced local files, upstream text and license preservation, excluded data paths, ignored graph outputs and preservation of the original responsive instructions. Before publishing v1.31.4, application regression tests, all 55 reporting API checks, frontend lint and the production build passed. Release metadata updates the root package and lockfile version; application source and dependency resolutions are unchanged. No UI source changed, so viewport checks were not rerun.
