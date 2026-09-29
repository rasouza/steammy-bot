import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogXbox } from '../../../database/entities/index.js';
import type { Game } from '../../../shared/types/index.js';
import type { PlatformRepository } from '../platform.types.js';

/**
 * Xbox's eligibility rule (research R5, spec FR-008): pending iff never
 * announced. The offer window is never consulted — `now` is accepted only
 * so both storefronts share the `PlatformRepository` contract.
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
}
