# Idea Intake: Decouple Platform Module from GameSource (storefront) Implementations

- **Slug**: platform-gamesource-decoupling
- **Created**: 2026-09-30
- **Source**: pasted text + repo pointer (`src/modules/platforms/`, `docs/plans/easy_add_platform.md`)
- **Type**: improvement

## Idea (as captured)

> "I believe this can be simplified even more towards developer experience and how easy it should be to implement a new platform. I see that code in platform module root is well separated from code in the storefront folders (xbox and epic). Maybe we can decouple these: platform module on its own and storefront module contains the implementations that the developer will do"

Follow-up naming preference (same intake session):

> "let's give a better name for storefront: GameSource."

Repo state observed while capturing (pointer only): the platform code today lives in `src/modules/platforms/` with `platforms.module.ts`, `xbox.service.ts`, and `epic.service.ts` at the module root — there are no literal `storefront/` folders in the tree.

## Restated

Propose splitting the current platform code into two modules: a generic platform module on its own, and a separate GameSource ("storefront") module that holds the per-platform implementations a developer writes when adding a new platform — with the goal of making a new platform as easy to implement as possible.

## Origin & Context

- **Raised by**: the project owner, while reading `docs/plans/easy_add_platform.md`
- **Trigger**: reviewing the platform architecture refactor plan (the plan targeting a generic platform lifecycle + platform registry); the idea extends that plan's developer-experience goal with a module-boundary split and the "GameSource" naming.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: How does this relate to the target architecture already specified in `docs/plans/easy_add_platform.md` — is it a refinement of that plan, a replacement, or an addition on top of it?]
- [NEEDS CLARIFICATION: What exactly goes in each module — which parts are "generic platform" concerns vs. "GameSource implementation" concerns (fetching, mapping, persistence, broadcast eligibility, cron scheduling)?]
- [NEEDS CLARIFICATION: Does "storefront folder (xbox and epic)" refer to the current `src/modules/platforms/*.service.ts` files, or to folders that exist in another branch/design not present in this tree?]
- [NEEDS CLARIFICATION: Is "GameSource" intended as the code-level name everywhere (class/interface/module names), or only for the module/folder?]
- [NEEDS CLARIFICATION: What is the target import direction and dependency rule between the platform module and the GameSource module (who depends on whom, and how is registration wired)?]
- [NEEDS CLARIFICATION: Does this change the six touch points for adding a platform documented in the README, and does it affect in-flight work (e.g. the `easy_add_platform.md` plan, Linear issues)?]
