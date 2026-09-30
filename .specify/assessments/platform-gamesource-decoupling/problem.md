# Problem Definition: A Clear, Validated Boundary for Platform Integration Work

- **Slug**: platform-gamesource-decoupling
- **Created**: 2026-09-30
- **Inputs used**: intake.md? | research.md? | user input only

## Problem Statement

When a developer integrates a new storefront platform into Steammy, the boundary between the generic platform machinery they must never touch and the platform-specific code they must write lives inside a single module and composition root — so integration means navigating and editing the shared module's own files rather than working inside a clearly separated area, which the maintainer experiences as residual friction even after the STE-1 refactor. The actual difficulty of adding a platform today has never been measured or validated by anyone other than its author, so it is unknown whether this friction is real, how large it is, and whether it is worth acting on before further docs, a generator, and a possible third platform harden the current layout.

*(The input arrived as a solution — "decouple into a platform module and a GameSource module"; the problem it targets is the boundary legibility and unvalidated ease of platform integration above.)*

## Affected Users & Stakeholders

- **Users**: the project's sole maintainer (Rodrigo Souza) — he writes every new platform integration and perceives the current single-module layout as not-simple-enough for the contributor role. — [source: intake.md origin; research.md Users & Demand] (confidence: high)
- **Users (potential)**: any future non-author contributor adding a platform — currently hypothetical; the first real one has never happened (only Epic and Xbox exist, both authored by the maintainer). — [source: research.md (repo tree, ASSUMPTION no third platform in progress)] (confidence: medium)
- **Stakeholders**: the maintainer — decision power over architecture, tracker of record for STE issues; he is both the affected user and the decider. — [source: Linear STE-1/STE-75 creators] (confidence: high)
- **Stakeholders (indirect)**: bot subscribers/server operators — they do not experience the problem, but they benefit if more platforms (and their free-game offers) ship faster. — [source: README platform list; ASSUMPTION] (confidence: medium)
- [NEEDS CLARIFICATION: Will anyone other than the maintainer ever add a platform? If not, "contributor-facing" structure serves a single person.]

## Goals

- The line between generic platform code and platform-specific implementation is obvious at a glance to someone integrating a new platform — they know exactly what to write and exactly what not to touch. — [source: intake.md "how easy it should be to implement a new platform"; spec 003 US1] 
- The ease of adding a platform is validated by someone other than the refactor's author (closes the still-open STE-76). — [source: research.md, Linear STE-76]
- Any structural change preserves the behavior guarantees STE-1 just landed: byte-identical announcement literals, preserved cron timings, Epic/Xbox eligibility semantics, send→mark-broadcasted ordering. — [source: spec 003 acceptance criteria, research.md Data & Constraints]
- The decision whether further restructuring is even warranted rests on evidence (a measured baseline), not on intuition. — [source: research.md Evidence Against #1]

## Non-Goals

- Changing any runtime behavior: sync, broadcast eligibility, Discord delivery, schedules, admin commands. — [source: STE-1 "preserve existing behavior" rule]
- The DX levers already scoped to Linear STE-75 (unified catalog table / no-migration platforms, scaffold generator) — out of scope here, coordinate only. — [source: Linear STE-75]
- Renaming vocabulary repo-wide to "GameSource" — naming is a downstream decision, not part of the problem. — [source: research.md Prior Art ("GameSource" has zero repo occurrences)]
- Fixing or re-litigating the STE-1 architecture itself (generic lifecycle + registry are settled and merged). — [source: research.md Prior Art]
- Any user-facing feature, new platform, or database/schema change. — [source: research.md Data & Constraints]

## Success Metrics

- **Files edited (not created) when integrating a hypothetical platform**, and specifically how many of those edits fall outside the platform area — baseline: 4 registration files inside `src/modules/platforms/` (`platform.constants.ts`, `platform.registry.ts`, `platforms.module.ts`) plus 1 outside it (`subscription/dto/platform-option.dto.ts`), per the merged `docs/platform-integration.md`. (baseline: 5 edits, 1 outside)
- **Non-author validation passes** — a maintainer who did not write the refactor follows the integration guide end-to-end and confirms only new platform files plus registration entries change (STE-76) — baseline: not started. (measurable: yes/no)
- **Zero regressions** — full CI gate (prettier, type:check, lint, build, test:cov, test:e2e) green and behavior-parity checks (message literals, cron timings, eligibility specs) unchanged after any structural work — baseline: green on merged `origin/main` `d586177`. (measurable: yes/no)
- **Perceived boundary clarity** — maintainer can point to "generic" vs "you write this" areas without consulting the guide — baseline: perceived insufficient (qualitative; this is the claimed problem itself). (qualitative, labeled)
- **Time-to-integration** for a hypothetical new platform (e.g., Steam) following only the repo docs — baseline: unknown, no measurement has ever been taken. (measurement itself would be new)

## Cost of Inaction

If nothing is built, Steammy keeps the merged STE-1 layout: it satisfies spec 003's acceptance criteria, the bot works, and adding a platform means 9 documented artifacts with 5 registration edits — a known, tolerable cost. The risk of inaction is timing, not breakage: the integration guide (STE-76 review still pending), a possible generator (STE-75), and the next real platform will harden the current paths, so if the maintainer's perceived friction turns out to be real, the reorganization gets more expensive and must be done twice — or quietly never done. Conversely, if the friction is *not* real, doing nothing costs nothing, while acting would churn 44 freshly-merged files for no measured gain (research.md Evidence Against #1–#2). The cost of inaction is therefore **bounded and known; the cost of acting on an unmeasured premise is the open risk** — which is exactly what `/speckit.assess.decide` must weigh.

## Open Questions

- [NEEDS CLARIFICATION: What measurable "easier" would satisfy the maintainer — fewer edits, fewer files to read, a smaller guide — and what is today's actual baseline? (Research found the DX claim unmeasured; STE-76 not started.)]
- [NEEDS CLARIFICATION: How does this idea relate to Linear STE-75 ("Simplify adding new storefront platforms") — same initiative, successor, or competing approach? Does this assessment need its own STE issue?]
- [NEEDS CLARIFICATION: Is replacing "storefront" with "GameSource" part of the goal (and scope of that rename), or incidental wording from the intake?]
- [NEEDS CLARIFICATION: If STE-76's non-author review concludes the current guide is already easy enough, does the problem statement still hold — i.e., what evidence would falsify it?]
- [NEEDS CLARIFICATION: Should STE-74 (broadcast-tracking table, blocked-by STE-1) land before any structural change, to avoid moving the same files twice?]
- [NEEDS CLARIFICATION: If no second contributor will ever exist, on what basis should contributor-facing separation be valued over the current single-composition-root simplicity?]
