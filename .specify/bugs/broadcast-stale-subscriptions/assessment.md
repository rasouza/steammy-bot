# Bug Assessment: BroadcastService sends to subscriptions of soft-deleted guilds

- **Slug**: broadcast-stale-subscriptions
- **Created**: 2026-09-29
- **Source**: pasted text (application log excerpt from an Xbox broadcast run)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

Pasted log excerpt from `BroadcastService`, one run of an Xbox broadcast
("Minecraft Dungeons II"), showing ~29 WARN lines interleaved with the
successful sends:

```
[Nest] 19 - 09/29/2026, 6:10:03 PM WARN [BroadcastService] Could not send broadcast to channel 1379757068491427871: Unknown Channel
[Nest] 19 - 09/29/2026, 6:10:04 PM WARN [BroadcastService] Could not send broadcast to channel 1310742261759479909: Missing Access
[Nest] 19 - 09/29/2026, 6:10:07 PM WARN [BroadcastService] Could not send broadcast to channel 1370775821937279079: Missing Permissions
...
```

Reporter's hypothesis (verbatim): *"I believe this is trying to broadcast to
channels it already know it won't be possible to. Check the deleted field in db
for these, I think they are all true."*

No URL was supplied; source is the pasted log block only.

### DB verification performed (read-only)

The 29 unique channel IDs from the WARN lines were joined against
`steammy_bot.subscription` → `steammy_bot.guild` (SELECT only):

- **20 of the 29** failing channel rows belong to a guild with
  `guild.deleted = true` — the reporter's hypothesis holds for ~69% of the
  warnings.
- **9 of the 29** belong to guilds with `guild.deleted = false` — the bot is
  still in those guilds; the channel was deleted or the bot lost access
  (`Unknown Channel` / `Missing Access` / `Missing Permissions`). The reporter's
  "all true" assumption is *mostly* but not entirely right.
- Table totals: **54** subscription rows, of which **22 (41%)** sit in a
  soft-deleted guild; **62** guild rows, of which **23 (37%)** are
  `deleted = true`.

## Symptom

Every broadcast run logs a batch of `Could not send broadcast to channel <id>:
Unknown Channel / Missing Access / Missing Permissions` warnings for channels
the bot has no hope of reaching — expected is a quiet run that only touches
channels it can post to. The bot nonetheless performs a Discord channel fetch
for each dead target on every run (the cron fires hourly at `:10`).

## Reproduction

1. Have at least one `subscription` row whose `guild_id` points at a `guild`
   row with `deleted = true` (any guild the bot was removed from — 23 such
   guilds exist today).
2. Run the bot and let `@Cron('10 * * * *')` fire, or call
   `BroadcastService.broadcastXbox()` / `broadcastEpic()` directly.
3. Observe WARN lines naming those channel IDs.
4. Confirm with a read-only join:
   `SELECT s.id, s.guild_id, g.deleted FROM steammy_bot.subscription s JOIN steammy_bot.guild g ON g.id = s.guild_id WHERE g.deleted` —
   the WARNed IDs appear there.

## Suspected Code Paths

- `src/modules/broadcast/broadcast.service.ts:125` — `send()` loads
  subscriptions with `where: { platform }` only: no join to `guild`, no
  `guild.deleted` filter. This is the defect.
- `src/modules/broadcast/broadcast.service.ts:131-149` — the loop fetches every
  subscription's channel and swallows the failure into a WARN, so a dead target
  costs a REST call plus a warning on every single broadcast.
- `src/modules/bot/bot.service.ts:41-49` — `guildDelete` soft-sets
  `guild.deleted = true` and never touches `subscription` rows, so they
  accumulate as permanent broadcast targets.
- `src/database/entities/guild.entity.ts:19-20` — the `deleted` column exists on
  `Guild` only; `Subscription` has no such flag and is never filtered on it.
- `src/database/migrations/1790514243494-InitSchema.ts:20` — the FK is
  `ON DELETE CASCADE`, which fires only on hard deletes; the soft-delete path
  (`guild.deleted = true`) never triggers it.
- `src/modules/subscription/subscription.service.ts:68-88` — subscriptions are
  removed only by an explicit `/unsubscribe` command, never as a consequence of
  leaving a guild.

## Root Cause Hypothesis

`BroadcastService.send()` filters subscriptions by `platform` alone and ignores
the `guild.deleted` soft-delete flag that `BotService.onGuildDelete` writes.
When the bot is removed from a guild, its `guild` row is marked
`deleted = true` but its `subscription` rows survive (the `ON DELETE CASCADE`
FK only covers hard deletes), so every subsequent broadcast keeps fetching and
posting to channels in guilds the bot has already left — producing the
`Unknown Channel` / `Missing Access` warnings. **Confidence: high** — the code
path is unambiguous and the read-only DB join confirms 20 of the 29 failing
channels are exactly in this state.

The remaining 9 failures are a *separate* class (dead channels / revoked
permissions inside guilds the bot is still in), also real but explicitly out of
scope for this fix per the reporter's decision.

## Proposed Remediation

**Preferred**: make `BroadcastService.send()` skip subscriptions whose guild is
soft-deleted. Load the `guild` relation alongside the platform filter and
continue past any row where `subscription.guild.deleted === true`, *before*
calling `this.client.channels.fetch(...)`:

```ts
const subscriptions = await this.subscriptionRepository.find({
  where: { platform },
  relations: { guild: true },
});

for (const subscription of subscriptions) {
  if (subscription.guild?.deleted) continue;
  // ... unchanged fetch/send/try-catch
}
```

This kills ~69% of the observed warnings with no data mutation, needs no
migration, and takes effect immediately for the 22 already-orphaned rows. It is
also directly unit-testable in this repo's style (services constructed by hand
with stub repositories — no DB in the test suite).

**Alternatives**:

- *DB-side filter* — `find({ where: { platform, guild: { deleted: false } } })`
  (TypeORM 0.3 nested relation condition). Cleaner SQL, but with no database in
  the unit suite a test can only assert the arguments passed to a stub, not real
  behavior; the in-loop guard is the better fit for the current test
  architecture. Either can be layered on the other later.
- *Hard-delete subscriptions in `onGuildDelete`* — fixes the data at the source,
  but only for guilds left *after* the change ships; the 20 existing orphan rows
  would still need a one-time cleanup, and it silently destroys a user's
  subscription intent if the bot is re-invited.
- *Prune on Discord error 10000/50001* — would also address the 9 residual
  failures, but deletes user data from inside a broadcast loop (out of scope by
  decision; worth its own bug).

**Files likely to change**:

- `src/modules/broadcast/broadcast.service.ts`
- `src/modules/broadcast/broadcast.service.spec.ts` (new)

**Tests to add or update**:

- A new `broadcast.service.spec.ts`, constructed directly as
  `new BroadcastService(fakeClient, fakeEpicRepo, fakeXboxRepo, fakeSubRepo,
  embed)` (matching `game-embed.service.spec.ts` style):
  - skips a subscription whose `guild.deleted === true` — `channels.fetch` is
    never called for it and no WARN is logged;
  - still fetches and sends for a subscription whose `guild.deleted === false`;
  - still logs `Could not send broadcast to channel <id>` when a *live* guild's
    channel throws (existing behavior preserved).

## Risks & Considerations

- **Re-invite semantics**: `onGuildCreate` resets `deleted = false`, so a guild
  the bot rejoins resumes its old subscriptions automatically — including ones
  created long ago. That is arguably desirable, but it is a behavior note, not
  a regression.
- **Residual noise**: 9 WARN lines per run remain (dead channels in live
  guilds). Do not treat this fix as "the warnings are gone"; it removes the
  soft-deleted-guild share only.
- **No migration / no schema change**, so no deploy-time risk; the change is
  confined to one query plus one guard in `send()`.
- **Observability**: skipping silently hides how many targets are being
  ignored. Consider a debug-level line (not WARN) so the skip remains visible
  without re-creating the noise.
- **Related, out of scope**: `broadcastEpic`/`broadcastXbox` set
  `broadcasted = true` *before* `send()` (documented in
  `docs/plans/easy_add_platform.md`), so a fully failed run never retries. This
  fix does not change that ordering.
- The test needs hand-written fakes for `Client`, `Repository<CatalogEpic>`,
  `Repository<CatalogXbox>`, and `Repository<Subscription>`; keep them minimal
  and local to the spec file.

## Open Questions

- [NEEDS CLARIFICATION] Should a rejoined guild resume its pre-existing
  subscriptions, or should re-inviting start from a clean slate? The preferred
  fix implies "resume"; the answer only matters if the maintainer wants the
  opposite, which would require the hard-delete alternative instead.
- [NEEDS CLARIFICATION] Want the 9 dead-channel-in-live-guild failures filed as
  a follow-up bug (prune on `Unknown Channel` = error 10000)? Out of scope here
  by explicit decision.
