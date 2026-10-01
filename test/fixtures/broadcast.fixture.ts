import { ChannelType } from 'discord.js';
import type { EntityManager } from 'typeorm';
import {
  CatalogEpic,
  Guild,
  Subscription,
} from '../../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../../src/gamesources/epic/index.js';

/**
 * Deterministic fixtures for the broadcast e2e suite. Every row id is
 * prefixed `dev-`, which is exactly what `purgeFixtureRows` (db.fixture.ts)
 * deletes — tests can never touch rows they did not create.
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

export async function seedGuild(
  em: EntityManager,
  id: string,
  deleted: boolean,
): Promise<void> {
  await em.save(Guild, {
    id,
    prefix: null,
    deleted,
    lastInteract: new Date(),
  });
}

export async function seedEpicSubscription(
  em: EntityManager,
  channelId: string,
  guildId: string,
): Promise<void> {
  await em.save(Subscription, {
    id: channelId,
    platform: EPIC_PLATFORM.type,
    guildId,
  });
}

/** An offer that is inside its window and pending — eligible for broadcast. */
export async function seedPendingEpicGame(
  em: EntityManager,
  broadcasted = false,
): Promise<void> {
  const day = 24 * 60 * 60 * 1000;
  await em.save(CatalogEpic, {
    id: PENDING_GAME_ID,
    title: 'Fixture Free Game',
    description: 'A deterministic fixture offer.',
    price: 0,
    size: null,
    developer: 'Fixture Studio',
    image: null,
    broadcasted,
    offer_start_at: new Date(Date.now() - day),
    offer_end_at: new Date(Date.now() + 30 * day),
  });
}

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
