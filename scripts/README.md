# GCC project scripts

Run commands from the repository root. Use existing manifests and lockfiles; this reorganization adds no runtime dependencies.

| Command | Purpose |
| --- | --- |
| `npm run check:repository` | Owned Markdown links/anchors, product entry points, package/lockfile names, path mappings |
| `npm test` | Node regression suite and reporting API checks using isolated fixtures |
| `npm run lint` / `npm run build` | Frontend lint and production compilation |
| `node scripts/validate-powerbi.js` | Microsoft schemas, native TMDL deserialization, visual-field references |
| `powershell -File scripts/test-powerbi-model.ps1` | Isolated Power BI fixture calculations; requires Desktop/TOM |
| `python scripts/preview-powerbi-fixture.py` | Temporary Desktop QA project containing synthetic records |
| `python deploy/linux-admin/build_release.py` | Regenerate admin script reference and build archives in ignored `deploy/dist/` |
| `python deploy/linux-admin/build_release.py --check` | Check generated script reference against shipped source |
| `npm run graph:build` / `npm run graph:query -- "question"` | Rebuild/query the ignored code map |

Power BI build/documentation generators are retained maintenance tools. Review output in an isolated copy: the saved active project uses TMDL, while the older generator can emit BIM and older report definitions. Do not overwrite the current model or reviewed documentation by running generators as routine validation. Model formats must not coexist in one canonical SemanticModel folder.

SharePoint CSV export and integrity audit scripts are operational tools. Inspect options, configuration, and the target database before use. They are not required to start or build GCC Timesheet App.
