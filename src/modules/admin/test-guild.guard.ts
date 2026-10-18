import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

/** What an out-of-scope invocation is told instead of running. */
export const TEST_GUILD_REFUSAL = 'These commands only run in the test guild.';

/**
 * Pure decision behind {@link TestGuildGuard}, split out the same way
 * `selectCommandScope` is: one string each, no Discord, no Nest.
 *
 * Fails closed in both directions — an unset `TEST_GUILD_ID` matches nothing,
 * not even an absent guild id, so `undefined === undefined` can never wave a
 * command through. That is the same shape `selectCommandScope` already has.
 */
export function permittedGuild(
  guildId: string | null | undefined,
  testGuildId: string | undefined,
): boolean {
  return Boolean(testGuildId) && guildId === testGuildId;
}

/**
 * The invocation half of contracts §1 — the one case registration cannot
 * cover. Discord only *offers* a guild command inside that guild, but a
 * command left over from an earlier registration (the spec's edge case: "a
 * registration that has not yet propagated away") is still invocable
 * everywhere, and a DM carries no guild id at all. The handler is the last
 * place the refusal can happen.
 *
 * Consulted first by all four handlers, so there is one copy of the rule
 * rather than four (Principle I) and no work happens before it answers.
 *
 * Not a Nest `CanActivate`: a `CanActivate` that returns `false` has
 * `ExternalExceptionFilter.catch` rethrow a `ForbiddenException`, and Necord
 * returns `execute(interaction)` straight into an `EventEmitter` listener
 * that drops the promise — so denying would surface as an unhandled
 * rejection and take the process down. Replying and returning `false` is the
 * only shape that neither runs the handler nor throws.
 */
@Injectable()
export class TestGuildGuard {
  constructor(private readonly config: ConfigService) {}

  /**
   * @returns `true` when the handler may proceed; after `false` the
   * interaction has already been answered and nothing else may run.
   */
  allow(interaction: ChatInputCommandInteraction): boolean {
    const testGuildId = this.config.get<string>('TEST_GUILD_ID');

    if (permittedGuild(interaction.guildId, testGuildId)) return true;

    // Best-effort and deliberately unawaited: the handler returns the moment
    // this is false, so waiting on Discord before it bails out would trade a
    // certain refusal for a possible unhandled rejection. Wrapped in
    // `Promise.resolve` so a non-thenable reply still settles here.
    void Promise.resolve(
      interaction.reply({
        content: TEST_GUILD_REFUSAL,
        flags: MessageFlags.Ephemeral,
      }),
    ).catch(() => undefined);

    return false;
  }
}
