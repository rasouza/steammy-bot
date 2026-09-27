import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity({ name: 'guild' })
export class Guild {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  prefix: string | null;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @Column({
    name: 'last_interact',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastInteract: Date;

  @OneToMany(() => Subscription, (subscription) => subscription.guild)
  subscriptions: Subscription[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
