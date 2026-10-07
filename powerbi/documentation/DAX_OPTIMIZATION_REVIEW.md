# GCC Requirements DAX optimization review

Date: 2026-10-06. Evidence: local source review and native-engine synthetic tests. Six variable refactors are applied to the saved TMDL model.

The `power-bi-dax-optimization` skill was run from `github/awesome-copilot`, and its complete output was read. It supplied no supporting-files directory or relative references. This review applies its performance, readability, blank-handling and maintainability checks to the existing GCC Requirements measures and relationships.

## Findings and priorities

| Priority | Measure / pattern | Finding | Proposed action |
| --- | --- | --- | --- |
| First benchmark | Capacity Vacation Hours | `SUMX(CROSSJOIN(People, Days), ...)` evaluates recorded leave and planned leave at employee/day grain. The candidate row count grows with selected employees multiplied by selected working days. Annual capacity measures depend on this calculation. | Capture annual and monthly query timings first. Investigate iterating only relevant employee/day leave pairs if timings show a bottleneck. Preserve daily caps, future-plan precedence, holidays, employee filters and unsupported project/task behavior. |
| Small refactor | Available Hours | Roster Capacity Hours is referenced twice. | Store the result in `VAR RosterCapacity`; retain the blank guard and zero floor. |
| Small refactor | Under Utilized % | Monthly Utilization % is referenced twice. | Store it in `VAR Utilization`; preserve blank and values below zero when utilization exceeds 100%. |
| Small refactor | Effort Deviation % | Delivered Project Budget Hours is referenced three times. | Store it once in the same filter context; retain employee/task guards and `DIVIDE`. |
| Small refactor | Effort / Schedule / Defect Alert Color | Each references its deviation/density measure twice. | Store the scalar result once. Preserve neutral blank color, absolute-deviation comparison and existing thresholds. |
| Further profiling | Project delivery measures | Repeated nested filters over delivered projects and selected dates are difficult to read. | Format and name the selected-date/cohort expressions before considering narrower column filters. Validate interactions with project, division and date filters. |
| Maintainability | Alert thresholds | Effort uses 5%, schedule 3%, and defect uses a 5-percentage-point distance from its configured target. | Document and confirm these business tolerances before adding parameters; this review does not change them. |

Variables make reuse explicit and improve readability, but the engine may already reuse intermediate results; repeated source references alone do not establish duplicate storage-engine work. Microsoft describes the benefits and context behavior in [Use variables to improve your DAX formulas](https://learn.microsoft.com/en-us/dax/best-practices/dax-variables). The row-count reasoning for the first finding follows the documented [CROSSJOIN behavior](https://learn.microsoft.com/en-us/dax/crossjoin-function-dax). No speedup percentage is claimed.

## Proposed formulas and rationale

The companion [DAX comparison query](../../scripts/compare-powerbi-dax-candidates.dax) defines six query-scoped candidates. It does not overwrite model measures. Each candidate keeps the original filters, conditions, blank behavior and formatting-independent numeric result. Variables stay in the original evaluation context; they are not moved outside a `CALCULATE` that intentionally changes context. Candidate-only measure names distinguish the comparison from the production model.

`Available Hours` retains the vacation calculation inside the successful capacity branch, rather than requesting it before the blank guard. `Effort Deviation %` likewise retains its actual-hours calculation inside the supported-grain branch. The alert candidates preserve exact boundary behavior: equality with the tolerance is not an alert.

The current model already uses `DIVIDE`, `KEEPFILTERS`, guarded missing-input results and measures for reusable business logic. These are useful existing patterns. Do not mechanically replace table-valued `VALUES` with scalar `SELECTEDVALUE`, or replace a nonblank-value `COUNT` with `COUNTROWS`; their semantics differ. No such replacements are proposed here.

## Validation and benchmarking

Run the companion query against the existing model. It compares original and candidate values over month/division combinations, totals, an empty date context, and filtered project/employee/task contexts. The month/division probe includes combinations without fact rows and can be expensive on larger models; restrict the date range for an initial run. Strict equality distinguishes blank from zero. An empty result means no mismatches in those contexts, not complete proof of equivalence.

Then exercise the existing isolated synthetic model suite and extend its assertions for these candidates: missing versus zero capacity/budget, utilization over 100%, positive and negative deviations at and around each threshold, missing deliverables, and conflicting/missing inputs. The existing suite alone does not execute these query-scoped candidates.

Capture original and candidate visual queries separately with identical filters and cold/warm cache conditions, repeating runs and comparing medians plus formula/storage-engine timings. The comparison query evaluates both versions together and is a correctness probe, not a fair performance benchmark. Do not judge scale from the tiny cached report dataset alone.

## Applied changes and results

Applied the six variable refactors to `GCC_Requirements.SemanticModel/definition/tables/_Measures.tmdl`. Measure names, formatting, lineage tags, thresholds and business conditions are retained. The employee/day capacity iterator is unchanged; a larger structural rewrite needs representative-scale evidence.

- Native comparisons against the original formulas: zero mismatches over month/division, total, empty-date, project, employee and task contexts in two synthetic fixtures.
- Boundary comparisons: 26 per fixture, 52 total, covering blanks, zero denominators, over-capacity and positive/negative alert boundaries.
- After application: all 72 measures evaluated; all 36 existing regression cases passed, including missing inputs, leave/holiday overlap, project capacity restrictions, delivery/quality and IST boundaries.
- Full report schema validation could not complete: the already-saved report references Microsoft's `visualContainer/2.13.0/schema.json`, which returned HTTP 404. No schema downgrade was made. Native TMDL deserialization and DAX execution succeeded.

| Annual summary, synthetic fixture | Original median | Applied candidate median |
| --- | ---: | ---: |
| Cold cache | 183.12 ms | 133.85 ms |
| Warm cache | 146.34 ms | 85.87 ms |

Each median uses seven alternating runs. The same query was executed after swapping all six formulas at model level in the isolated database. Model-save time is excluded; cold runs clear only that temporary database's cache, while warm runs execute an untimed warm-up first. These are client elapsed query times, not formula/storage-engine traces or measured production dashboard timings. The small synthetic dataset does not establish production-scale gains.

Query-scoped dependency overrides do not reach pre-existing model-defined formulas in these boundary tests. The harness therefore defines both baseline and candidate expressions at query scope for controlled-input comparisons. The benchmark uses actual model-level replacements to avoid that difference.

Original expressions are retained in `scripts/powerbi-dax-baseline.json` so comparisons remain meaningful after application. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-powerbi-model.ps1 -Port <DesktopEnginePort> -VerifyDaxCandidates` for original-versus-candidate checks and timings; omit `-VerifyDaxCandidates` to test the currently saved model. Both modes create and remove their own isolated synthetic database; they do not refresh or alter the canonical report database.

Evidence: [candidate comparisons and timings](../validation/dax-candidate-validation.json) and [applied-model regression results](../validation/engine-validation.json). Reopen the PBIP to load the saved formula changes into Desktop.
