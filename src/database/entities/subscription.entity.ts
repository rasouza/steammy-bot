import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
// The two entities import each other. Under native ESM a value import here
// would make tsc's generated `design:type` metadata dereference Guild while
// guild.entity.js is still initializing — a TDZ ReferenceError at class
// definition (the same dereference silently evaluated to `undefined` under
// CommonJS, where TypeORM never needed it: the relation type comes from the
// lazy arrow below). The type import carries the annotation; the namespace
// is only dereferenced inside the arrow, after both modules are initialized.
import type { Guild } from './guild.entity.js';
import * as guildEntity from './guild.entity.js';

@Entity({ name: 'subscription' })
export class Subscription {
  // Discord Channel ID
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  platform: string;

  @PrimaryColumn({ name: 'guild_id', type: 'varchar', length: 255 })
  guildId: string;

  @ManyToOne(() => guildEntity.Guild, (guild) => guild.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
