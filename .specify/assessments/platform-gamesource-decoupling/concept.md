# Concept: Make Platform-Integration Friction Measurable Before Moving Code

- **Slug**: platform-gamesource-decoupling
- **Created**: 2026-09-30
- **Recommended option**: Option A — Validate the Friction First (measure, then decide) — *superseded 2026-09-30: maintainer revised the decision to Option B, see [decision.md](./decision.md)*

## Options

### Option A — Validate the Friction First (measure, then decide)

- **Sketch**: Change nothing structurally right now. Produce the evidence the problem says is missing: run the still-open non-author guide review (STE-76) and walk a hypothetical "add Steam" integration end-to-end on paper (create the 9 documented artifacts in a scratch branch, or dry-run them), recording exactly which files must be read, which edited, where the contributor hesitates, and how long it takes. The output is a baseline (edits outside the platform area, time-to-integration, confusion points) plus a short verdict: *is the single-module boundary actually the source of friction, or is it docs/naming/registration scatter?* Only if the verdict says "boundary" does a structural option (B) get specified next — with real numbers instead of intuition. Small legibility fixes the walk exposes (guide gaps, a map in the docs) can ride along.
- **Appetite**: small (days)
- **Trade-offs**: Wins evidence, zero regression risk, no churn over the 44-file STE-1 merge, and a decision that satisfies goal "rests on evidence, not intuition"; also naturally sequenced after STE-74/STE-75 questions surface. Sacrifices immediate motion on the maintainer's stated preference, and in a single-maintainer repo a true "non-author" may not exist — a self-run dry-run with a checklist is a weaker proxy. Risk: measurement theater — the walk is done by someone who already knows the answer.
- **Rabbit holes**: letting the dry-run silently become the refactor; recruiting an actual second person for STE-76 (may be impossible → metric never closes); measuring the guide's quality instead of the module boundary and drawing the wrong conclusion.

### Option B — Split the Module (the intake's proposal: platform module + GameSource module)

- **Sketch**: Restructure so the generic platform lifecycle/registry/scheduler lives in one module and the per-platform implementations a developer writes (Epic, Xbox, future Steam) live in a separate GameSource module — a developer adding a platform creates and touches files only inside their module, while the generic machinery becomes a dependency they consume rather than a folder they edit. Vocabulary ("storefront" → "GameSource") would be renamed to match wherever the boundary lands.
- **Appetite**: medium (weeks)
- **Trade-offs**: Wins the clearest possible ownership boundary matching the maintainer's mental model, directly targeting the "obvious at a glance" goal and potentially reducing *out-of-area* edits. Sacrifices stability: it re-opens layout decision R7 (decided 2026-09-29) and moves files just merged hours earlier; the registration edits (4–5 touch points) largely remain either way, so the edit-count metric may not improve at all. Risks: DI cycle around the existing `PlatformsModule → BroadcastModule` edge, ESM import/extension churn across ~9 consumer files, and double-moving if STE-74 (broadcast-tracking table) or STE-75 (generator paths) land afterward.
- **Rabbit holes**: dependency-direction design (who owns the broadcast port) expanding into an architecture exercise; repo-wide "GameSource" rename; discovering the split *increases* wiring without decreasing edits and re-litigating mid-flight; interacting with the STE-75 generator's scaffold targets.

### Option C — Do Nothing / Buy Instead of Build

- **Sketch**: Accept merged STE-1 as the answer to the original DX problem and close this assessment. The perceived friction gets addressed by work already scoped elsewhere: STE-76 validates the guide, and STE-75's levers (a scaffold generator that writes the files for you, unified catalog table removing per-platform migrations) attack platform-add cost at a higher level — the generator makes *where the files live* nearly irrelevant because nobody writes them by hand.
- **Appetite**: none (close the assessment) — with STE-75 itself being a separate, large effort already in the backlog
- **Trade-offs**: Wins zero churn, full focus on STE-75's higher-leverage levers, no risk to the fresh merge. Sacrifices the boundary-legibility goal if it turns out to be real and independent of tooling; defers the question until paths have hardened (generator, guide, third platform), which is the research-documented "move twice" risk. Key risk: the problem statement's friction may be genuine and unaffected by a generator's existence — buying tooling doesn't clarify a boundary a human still has to read.
- **Rabbit holes**: STE-75 scope (generator + DB unification) dwarfing this idea and absorbing it entirely; "do nothing" quietly becoming "never validated" if STE-76 also stalls.

## Recommendation *(superseded 2026-09-30 — maintainer revised the decision to Option B, see [decision.md](./decision.md))*

**Option A — Validate the Friction First.** The problem as defined turns on one fact: *the ease of adding a platform has never been measured or validated by anyone but its author* (STE-76 not started, baseline "unknown" in every metric). Option B spends a medium appetite moving 21 in-module files plus ~9 consumers to fix a boundary whose cost is unquantified — directly contradicting the goal that the decision "rest on evidence," and its headline metric (edits outside the platform area: currently 1) may not improve at all. Option C abandons the legibility goal without checking whether it's real. Option A is the only option that *produces the baseline problem.md asks for*, costs days not weeks, carries zero regression risk to the just-landed guarantees, and yields a falsifiable verdict that either earns Option B at `/speckit.specify` (with numbers) or closes the assessment honestly. It also resolves several open questions as a by-product (STE-75 relationship, falsification criterion, measure baseline).

## Out of Scope (for the recommended option)

- Any file moves, module splits, or import restructuring (Option B deferred, gated on A's verdict).
- Renaming "storefront" → "GameSource" anywhere.
- The STE-75 levers (generator, unified catalog table) and STE-74 (broadcast-tracking table) — coordinated with, not executed by, this concept.
- Any runtime/behavior change (sync, broadcast, schedules, Discord delivery) — full CI gate must stay green even on the scratch dry-run branch.
- Producing a specification or task breakdown — that follows only if A's verdict recommends B.

## Assumptions to Validate

- A paper/dry-run integration of a hypothetical platform can produce a valid baseline without real third-party API code (stub `fetch()` suffices for measuring edit/reading friction).
- A meaningful non-author signal can be obtained in a single-maintainer repo — or the maintainer accepts a checklist-driven self-run as a knowingly weaker proxy (STE-76 may remain uncloseable).
- The friction, if real, is attributable to the module boundary rather than to docs quality, registration scatter, or naming — the verdict must separate these.
- The STE-1 layout stays stable during the measurement window (no concurrent structural merges would invalidate the baseline).
- The maintainer commits *before* running A to accept its verdict: no split if the numbers show the boundary isn't the pain point.
- Measuring does not itself require solving the "who is a second contributor" open question — the dry-run is by the maintainer acting as a first-time integrator.
