import { ChannelType } from 'discord.js';

/**
 * The Discord side of the boundary: exactly the surface `BroadcastService`
 * touches on a fetched channel. `send` is a per-test spy (or a recorder that
 * delegates to one). Channel ids are fake snowflakes: only their uniqueness
 * matters, and each test names the channels it builds.
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
