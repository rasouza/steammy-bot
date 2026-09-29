import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Guild } from './guild.entity.js';

@Entity({ name: 'subscription' })
export class Subscription {
  // Discord Channel ID
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  platform: string;

  @PrimaryColumn({ name: 'guild_id', type: 'varchar', length: 255 })
  guildId: string;

  @ManyToOne(() => Guild, (guild) => guild.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
