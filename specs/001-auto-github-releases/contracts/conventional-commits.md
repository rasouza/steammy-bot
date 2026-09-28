# Contract: Conventional Commits (contributor-facing)

**Consumers**: version inference (research D2), generated release notes (FR-005)
**Status**: quality contract — correctness degrades gracefully, never blocks (research D9)

Every commit message that lands on `main` — including squash-merge PR titles — should follow this
shape. The pipeline parses it to infer the release version (FR-003) and to build release notes.

## Grammar

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer: BREAKING CHANGE: <description>]
```

- `!` after the type/scope, or a `BREAKING CHANGE:` footer, marks a **breaking change**.
- Examples: `feat(commands): add /catalog search`, `fix(broadcast): handle empty embed`,
  `docs: document release flow`, `chore(deps): bump action versions`.

## Type → version segment mapping

| Commit signal                                          | Segment | Release? |
|--------------------------------------------------------|---------|----------|
| breaking (`!` or `BREAKING CHANGE:` footer)            | major   | yes      |
| `feat`                                                 | minor   | yes      |
| `fix`, `docs`, `chore`, `build`, `ci`, `refactor`, `test`, `style`, `perf`, `revert` | patch | yes |
| merge commits and any non-conforming message           | patch   | yes (catch-all) |

- Multiple commits in one merge → **highest** segment wins.
- No inferable type → **patch** (a release is still produced; nothing blocks on message format).

## Rules for contributors

1. PR titles must be conventional if the PR is squash-merged (the title becomes the commit
   message).
2. Breaking changes **must** declare `!` or a `BREAKING CHANGE:` footer — the major bump is
   invisible otherwise.
3. Message quality drives notes quality: a vague `chore: stuff` yields a vague release-note line
   (SC-004).

## Non-goals

- No blocking CI lint on message format is required by this feature (optional follow-up).
- Legacy history before `v3.0.0` is not rewritten or reinterpreted.
