import { Logger } from '@nestjs/common';
import { GamePlatform } from '../../shared/constants.js';
import type { GamePlatformType } from '../../shared/constants.js';
import { PlatformScheduler } from './platform.scheduler.js';

function fakeRuntime(type: GamePlatformType) {
  return {
    type,
    sync: vi.fn<() => Promise<void>>(),
    broadcastPending: vi.fn<() => Promise<number>>(),
  };
}

describe('PlatformScheduler', () => {
  let logs: { error: string[] };

  beforeEach(() => {
    logs = { error: [] };
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
    const scheduler = new PlatformScheduler([epic, xbox]);

    await scheduler.syncAll();

    expect(epic.sync).toHaveBeenCalledTimes(1);
    expect(xbox.sync).toHaveBeenCalledTimes(1);
  });

  it('continues with the remaining storefronts when one sync throws (Q1)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.sync.mockRejectedValue(new Error('epic is down'));
    const scheduler = new PlatformScheduler([epic, xbox]);

    await expect(scheduler.syncAll()).resolves.toBeUndefined();

    expect(xbox.sync).toHaveBeenCalledTimes(1);
    expect(logs.error.join('\n')).toContain('epic is down');
  });

  it('announces across the whole registry and sums the counts', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.broadcastPending.mockResolvedValue(2);
    xbox.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic, xbox]);

    const total = await scheduler.broadcastAll();

    expect(total).toBe(3);
    expect(epic.broadcastPending).toHaveBeenCalledTimes(1);
    expect(xbox.broadcastPending).toHaveBeenCalledTimes(1);
  });

  it('keeps announcing after one storefront fails mid-pass (Q1)', async () => {
    const epic = fakeRuntime(GamePlatform.EPIC);
    const xbox = fakeRuntime(GamePlatform.XBOX);
    epic.broadcastPending.mockRejectedValue(new Error('epic exploded'));
    xbox.broadcastPending.mockResolvedValue(1);
    const scheduler = new PlatformScheduler([epic, xbox]);

    const total = await scheduler.broadcastAll();

    expect(total).toBe(1);
    expect(xbox.broadcastPending).toHaveBeenCalledTimes(1);
    expect(logs.error.join('\n')).toContain('epic exploded');
  });
});
