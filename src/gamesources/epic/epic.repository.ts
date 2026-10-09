import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { CatalogEpic } from '../../database/entities/index.js';
import type { EpicGame } from './epic.types.js';
import type { PlatformRepository } from '../../modules/platforms/platform.types.js';

/**
 * Epic's eligibility rules (research R5, spec FR-002/FR-007). Pure and
 * unit-tested — generic code must never reconstruct this criteria (FR-005).
 *
 * Split in two so a dev candidate can reuse the window rules with the
 * announcement flag ignored (contracts §3, rule R-3.1): `epicPendingCriteria`
 * is exactly this plus `broadcasted: false`.
 */
export function epicEligibleCriteria(now: Date) {
  return {
    offer_start_at: LessThanOrEqual(now),
    offer_end_at: MoreThanOrEqual(now),
  };
}

export function epicPendingCriteria(now: Date) {
  return {
    broadcasted: false,
    ...epicEligibleCriteria(now),
  };
}

@Injectable()
export class EpicRepository implements PlatformRepository<EpicGame> {
  constructor(
    @InjectRepository(CatalogEpic)
    private readonly repository: Repository<CatalogEpic>,
  ) {}

  async saveAll(games: EpicGame[]): Promise<void> {
    await this.repository.upsert(games, ['id']);
  }

  async findPending(now: Date): Promise<EpicGame[]> {
    return this.repository.find({ where: epicPendingCriteria(now) });
  }

  async markBroadcasted(game: EpicGame): Promise<void> {
    await this.repository.save({ ...game, broadcasted: true });
  }

  /**
   * The row `/dev broadcast` will deliver, or `null` when the catalog is
   * empty.
   *
   * **Deliberately window-free.** `/dev broadcast` promises exactly one
   * message per platform into the channel the operator is standing in, so a
   * stored row is picked whatever its offer window says — an Epic offer that
   * has not opened yet is still a real game, and a smoke test is about the
   * pipeline, not about what is currently free (contracts §3, rule R-3.1).
   * The window still governs the *scheduled* pass and `/broadcast`, which go
   * through `findPending` and keep their window + `broadcasted: false`
   * criteria untouched.
   */
  async findDevCandidate(_now: Date): Promise<EpicGame | null> {
    const rows = await this.repository.find({
      where: {},
      order: { id: 'ASC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async markBroadcastedExcept(candidate: EpicGame, now: Date): Promise<number> {
    const { affected } = await this.repository.update(
      { ...epicPendingCriteria(now), id: Not(candidate.id) },
      { broadcasted: true },
    );
    return affected ?? 0;
  }

  async markPending(game: EpicGame): Promise<void> {
    await this.repository.update({ id: game.id }, { broadcasted: false });
  }

  async clear(): Promise<void> {
    await this.repository.deleteAll();
  }

  async markAllBroadcasted(): Promise<number> {
    const { affected } = await this.repository.updateAll({
      broadcasted: true,
    });
    return affected ?? 0;
  }
}
