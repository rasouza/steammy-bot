# Bug Fix: Skip subscriptions of soft-deleted guilds in BroadcastService

- **Slug**: broadcast-stale-subscriptions
- **Fixed**: 2026-09-29
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`BroadcastService.send()` now loads the `guild` relation with each subscription
and skips any row whose guild has been soft-deleted (`guild.deleted === true`)
before fetching the channel — so broadcasts no longer hit channels in guilds the
bot has already left, which accounted for 20 of the 29 WARN lines in the
reported run.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/modules/broadcast/broadcast.service.ts` | modified | `send()` queries with `relations: { guild: true }` and `continue`s past soft-deleted guilds before `client.channels.fetch()`, emitting a `debug` line naming the skipped channel. |
| `src/modules/broadcast/broadcast.service.spec.ts` | added test | Three specs over a hand-built `BroadcastService` (stub repos + stub `Client`, no Nest testing module, no DB). |

No migration, no entity change, nothing outside the two files the assessment
listed.

## Diff Highlights (optional)

```ts
 const subscriptions = await this.subscriptionRepository.find({
   where: { platform },
+  relations: { guild: true },
 });

 for (const subscription of subscriptions) {
+  // Subscriptions of guilds the bot has been removed from survive in the
+  // table (`guildDelete` only flips `guild.deleted`; the FK cascades on
+  // hard deletes only), so filter them out before paying for a fetch.
+  if (subscription.guild?.deleted) {
+    this.logger.debug(
+      `Skipping broadcast to channel ${subscription.id}: guild ${subscription.guildId} is no longer served`,
+    );
+    continue;
+  }
+
   try {
     const channel = await this.client.channels.fetch(subscription.id);
```

## Tests Added or Updated

- `src/modules/broadcast/broadcast.service.spec.ts::skips subscriptions whose guild is soft-deleted` — pins that `channels.fetch` is never called for a soft-deleted-guild row, that no WARN is logged for it, and that a `debug` line names the skipped channel.
- `src/modules/broadcast/broadcast.service.spec.ts::sends the broadcast to channels of guilds that are still served` — pins the happy path: live guild rows still get `channel.send(...)` with the expected content and no WARN.
- `src/modules/broadcast/broadcast.service.spec.ts::still warns when a live guild channel cannot be fetched` — pins the pre-existing failure behavior (`Could not send broadcast to channel <id>: Unknown Channel`) so the skip guard does not accidentally swallow real errors.

## Local Verification

- `npx prettier --check "src/**/*.ts" "test/**/*.ts"` → pass (all files).
- `npm run type:check` → pass (`tsc --noEmit`, also typechecks the new spec).
- `npm run lint` → exit 0; 22 warnings total, none in `src/modules/broadcast/`
  (matches the documented clean-tree baseline; the 7
  `vitest(require-mock-type-parameters)` warnings the first draft introduced
  were fixed by giving every `vi.fn()` an explicit type parameter).
- `npm run build` → pass (`nest build`).
- `npm test` → 2 files, 9 tests passed (6 pre-existing + 3 new).
- `npm run test:cov` → exit 0, 9 tests passed, coverage summary produced.
- `npm run test:e2e` → 1 file, 1 test passed.
- Manual checks: the assessment's read-only DB join (20/29 failing channels in
  soft-deleted guilds) was the evidence base; no data was written to the
  database during this fix.

## Deviations from Assessment

- **Added the `debug`-level skip log** — the assessment listed this under
  *Risks & Considerations → Observability* as something to "consider", not as
  part of the preferred patch. It was included because it is one statement and
  it keeps skipped targets observable without restoring WARN noise.
- No other departure: the query shape, the in-loop guard, the file list, and
  the three test cases match the assessment's **Preferred** remediation
  exactly. The DB-side-filter alternative was deliberately not applied.

## Follow-ups

- **Residual warnings**: ~9 WARN lines per run will remain (dead channels /
  revoked permissions inside guilds the bot is still in — the rows with
  `guild.deleted = false` from the assessment). If the maintainer wants those
  gone, file a separate bug for pruning on Discord error `10000` (Unknown
  Channel); it was explicitly out of scope here.
- **Open question (from the assessment)**: a rejoined guild resumes its old
  subscriptions, because `guildCreate` resets `deleted = false`. Confirm that
  "resume on re-invite" is the intended behavior; if not, the hard-delete
  alternative in the assessment becomes the right shape.
- **Orphan rows remain in the table**: 22 of 54 subscription rows still point
  at soft-deleted guilds. They are now harmless at broadcast time, but a
  one-time cleanup (or cascading delete in `onGuildDelete`) would shrink the
  table and stop them from resurfacing if a guild is re-invited.
- **Monitoring**: after deploy, the WARN count for a run should drop from ~29
  to ~9. If it does not, the guild relation may not be loaded as expected in
  production (worth one log inspection after the first hourly cron).
- Pre-existing and untouched: `broadcastEpic`/`broadcastXbox` still set
  `broadcasted = true` *before* `send()` (tracked in
  `docs/plans/easy_add_platform.md`), so failed deliveries are not retried.
