import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CatalogEpic } from '../../../database/entities/index.js';
import type { EpicGame } from './epic.types.js';
import type { PlatformRepository } from '../platform.types.js';

/**
 * Epic's eligibility rules (research R5, spec FR-002/FR-007). Pure and
 * unit-tested — generic code must never reconstruct this criteria (FR-005).
 */
export function epicPendingCriteria(now: Date) {
  return {
    broadcasted: false,
    offer_start_at: LessThanOrEqual(now),
    offer_end_at: MoreThanOrEqual(now),
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
}
