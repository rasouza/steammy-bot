import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { CatalogXbox } from '../../database/entities/index.js';
import type { Game } from '../../modules/platforms/platform.types.js';
import type { PlatformRepository } from '../../modules/platforms/platform.types.js';

/**
 * Xbox's eligibility rule (research R5, spec FR-008): pending iff never
 * announced. The offer window is never consulted — `now` is accepted only
 * so both GameSources share the `PlatformRepository` contract.
 */
export function xboxPendingCriteria(_now: Date): { broadcasted: false } {
  return { broadcasted: false };
}

@Injectable()
export class XboxRepository implements PlatformRepository<Game> {
  constructor(
    @InjectRepository(CatalogXbox)
    private readonly repository: Repository<CatalogXbox>,
  ) {}

  async saveAll(games: Game[]): Promise<void> {
    await this.repository.upsert(games, ['id']);
  }

  async findPending(now: Date): Promise<Game[]> {
    return this.repository.find({ where: xboxPendingCriteria(now) });
  }

  async markBroadcasted(game: Game): Promise<void> {
    await this.repository.save({ ...game, broadcasted: true });
  }

  async findDevCandidate(_now: Date): Promise<Game | null> {
    // `broadcasted` is the platform's only eligibility rule and a dev
    // candidate deliberately ignores it (contracts §3, R-3.1), so every row
    // qualifies: an empty criteria, picked deterministically by ascending id.
    const rows = await this.repository.find({
      where: {},
      order: { id: 'ASC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async markBroadcastedExcept(candidate: Game, now: Date): Promise<number> {
    const { affected } = await this.repository.update(
      { ...xboxPendingCriteria(now), id: Not(candidate.id) },
      { broadcasted: true },
    );
    return affected ?? 0;
  }

  async markPending(game: Game): Promise<void> {
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
