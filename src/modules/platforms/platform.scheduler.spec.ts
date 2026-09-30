import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GamePlatform } from '../../gamesources/game-platform.js';
import type { GamePlatformType } from '../../gamesources/game-platform.js';
import { PlatformScheduler } from './platform.scheduler.js';

function fakeRuntime(type: GamePlatformType) {
  return {
    type,
    sync: vi.fn<() => Promise<void>>(),
    broadcastPending: vi.fn<() => Promise<number>>(),
  };
}

/** `undefined` simulates an unset BROADCAST_ENABLED, which must stay safe. */
function fakeConfig(broadcastEnabled: boolean | undefined): ConfigService {
  return {
    get: vi
      .fn<(...args: unknown[]) => boolean | undefined>()
      .mockReturnValue(broadcastEnabled),
  } as unknown as ConfigService;
}

describe('PlatformScheduler', () => {
  let logs: { log: string[]; error: string[] };

  beforeEach(() => {
    logs = { log: [], error: [] };
    vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.log.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      logs.error.push(String(m));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the sync pass over the whole registry', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(true));

    await scheduler.syncAll();

    expect(epic.sync).toHaveBeenCalledTimes(1);
    expect(xbox.sync).toHaveBeenCalledTimes(1);
  });

  it('continues with the remaining GameSources when one sync throws (Q1)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.sync.mockRejectedValue(new Error('epic is down'));
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(true));

    await expect(scheduler.syncAll()).resolves.toBeUndefined();

    expect(xbox.sync).toHaveBeenCalledTimes(1);
    expect(logs.error.join('\n')).toContain('epic is down');
  });

  it('announces across the whole registry and sums the counts', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.broadcastPending.mockResolvedValue(2);
    xbox.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(true));

    const total = await scheduler.broadcastAll();

    expect(total).toBe(3);
    expect(epic.broadcastPending).toHaveBeenCalledTimes(1);
    expect(xbox.broadcastPending).toHaveBeenCalledTimes(1);
  });

  it('keeps announcing after one GameSource fails mid-pass (Q1)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.broadcastPending.mockRejectedValue(new Error('epic exploded'));
    xbox.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(true));

    const total = await scheduler.broadcastAll();

    expect(total).toBe(1);
    expect(xbox.broadcastPending).toHaveBeenCalledTimes(1);
    expect(logs.error.join('\n')).toContain('epic exploded');
  });

  it('skips the announce pass entirely when BROADCAST_ENABLED is false (FR-013)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.broadcastPending.mockResolvedValue(2);
    xbox.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(false));

    const total = await scheduler.broadcastAll();

    expect(total).toBe(0);
    expect(epic.broadcastPending).not.toHaveBeenCalled();
    expect(xbox.broadcastPending).not.toHaveBeenCalled();
  });

  it('runs the sync pass even when announcements are disabled (A-007)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    const scheduler = new PlatformScheduler([epic, xbox], fakeConfig(false));

    await scheduler.syncAll();

    expect(epic.sync).toHaveBeenCalledTimes(1);
    expect(xbox.sync).toHaveBeenCalledTimes(1);
  });

  it('announces by default when the flag is unset (R4 production-safe)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    epic.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic], fakeConfig(undefined));

    const total = await scheduler.broadcastAll();

    expect(total).toBe(1);
    expect(epic.broadcastPending).toHaveBeenCalledTimes(1);
  });
});
