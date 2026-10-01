import { ChannelType } from 'discord.js';

/**
 * Scenario constants and the Discord-side fake for the broadcast e2e suite.
 * Every row id is prefixed `dev-`, which is exactly what `purgeFixtureRows`
 * (db.fixture.ts) deletes — tests can never touch rows they did not create.
 * Entity construction lives in `test/factories/` (Fishery, build-only); the
 * specs persist those instances through TypeORM repositories.
 *
 * Discord ids are fake snowflakes: only their uniqueness matters, because
 * `subscription.id` (the channel id) is part of the primary key and the
 * guild id is a foreign key.
 */
export const ACTIVE_GUILD_ID = 'dev-e2e-guild-active';
export const STALE_GUILD_ID = 'dev-e2e-guild-stale';
export const ACTIVE_CHANNEL_ID = '150000000000000001';
export const STALE_CHANNEL_ID = '150000000000000002';
export const PENDING_GAME_ID = 'dev-epic-pending-offer';

/**
 * The Discord side of the boundary: exactly the surface `BroadcastService`
 * touches on a fetched channel. `send` is a per-test spy.
 */
export function fakeTextChannel(
  name: string,
  send: (payload: unknown) => Promise<unknown>,
) {
  return {
    type: ChannelType.GuildText,
    name,
    guild: { name: 'Dev Guild' },
    send,
  };
}
