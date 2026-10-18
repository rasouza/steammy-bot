import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { TestGuildGuard } from './test-guild.guard.js';

/**
 * The invocation half of contracts §1 — US1 acceptance scenario 7 and the
 * spec's "an invocation arrives in a non-test guild" edge case.
 *
 * Registration scoping cannot cover this one. Discord only *offers* a guild
 * command in that guild, but a command left over from an earlier registration
 * is still invocable everywhere, and the edge case names exactly that cause —
 * "a registration that has not yet propagated away". The handler is the last
 * place the refusal can happen, which makes this the assertion that fails
 * **open** if it regresses: without it, an out-of-guild `/sync` runs.
 *
 * Deliberately a plain method rather than a Nest `CanActivate`. A guard that
 * returns `false` has `ExternalExceptionFilter.catch` rethrow it, and Necord
 * hands `execute(interaction)` straight to an `EventEmitter` listener — the
 * rejection escapes with nothing to catch it and takes the process down.
 * Refusing here, by replying and returning, is the only shape that neither
 * runs the handler nor throws.
 */

const TEST_GUILD = '111111111111111111';

interface FakeInteraction {
  guildId: string | null | undefined;
  reply: ReturnType<typeof vi.fn>;
}

function fakeInteraction(guildId: string | null | undefined): FakeInteraction {
  return {
    guildId,
    reply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
}

function asInteraction(fake: FakeInteraction): ChatInputCommandInteraction {
  return fake as unknown as ChatInputCommandInteraction;
}

function guardFor(testGuildId: string | undefined): TestGuildGuard {
  return new TestGuildGuard({
    get: (key: string) => (key === 'TEST_GUILD_ID' ? testGuildId : undefined),
  } as unknown as ConfigService);
}

describe('TestGuildGuard', () => {
  it('lets an invocation from the test guild through untouched', () => {
    const interaction = fakeInteraction(TEST_GUILD);

    expect(guardFor(TEST_GUILD).allow(asInteraction(interaction))).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  /** US1/AC7: refused *before* any handler work, with no state touched. */
  it('refuses an invocation from another guild', () => {
    const interaction = fakeInteraction('999999999999999999');

    expect(guardFor(TEST_GUILD).allow(asInteraction(interaction))).toBe(false);
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it('answers the refusal ephemerally, in the invoking context only', () => {
    const interaction = fakeInteraction('999999999999999999');

    guardFor(TEST_GUILD).allow(asInteraction(interaction));

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(
      typeof (interaction.reply.mock.calls[0] as [{ content: string }])[0]
        .content,
    ).toBe('string');
  });

  /** A DM has no guild, and `dmPermission: false` is Discord-side only. */
  it('refuses a direct message', () => {
    const interaction = fakeInteraction(null);

    expect(guardFor(TEST_GUILD).allow(asInteraction(interaction))).toBe(false);
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  /**
   * Contracts §2's failing-closed shape, applied to invocation: `undefined`
   * must never equal `undefined` and wave the command through.
   */
  it('refuses everything when no test guild is configured', () => {
    const noGuild = guardFor(undefined);

    expect(noGuild.allow(asInteraction(fakeInteraction(null)))).toBe(false);
    expect(noGuild.allow(asInteraction(fakeInteraction(undefined)))).toBe(
      false,
    );
  });

  it('refuses rather than runs when the guild id is merely absent', () => {
    const interaction = fakeInteraction(undefined);

    expect(guardFor(TEST_GUILD).allow(asInteraction(interaction))).toBe(false);
  });

  /**
   * The refusal is best-effort. It must never propagate: a rejection here
   * would surface in Necord's `interactionCreate` listener with nothing to
   * catch it. Losing the operator's error message is strictly better than
   * losing the process — the handler has already bailed out either way.
   */
  it('does not let a failed refusal escape', async () => {
    const interaction: FakeInteraction = {
      guildId: '999999999999999999',
      reply: vi.fn<() => Promise<void>>(() =>
        Promise.reject(new Error('Discord said no')),
      ),
    };

    expect(() =>
      guardFor(TEST_GUILD).allow(asInteraction(interaction)),
    ).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
