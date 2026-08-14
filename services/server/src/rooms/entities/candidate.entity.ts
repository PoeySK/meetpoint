import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from './room.entity';

export enum CandidateStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export type CandidateTime = {
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export type CandidatePlace = {
  name: string;
  address: string;
  area: string;
};

@Entity({ name: 'candidates' })
export class Candidate {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, (room) => room.candidates, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @Column({ type: 'integer' })
  displayOrder!: number;

  @Column({ type: 'jsonb' })
  time!: CandidateTime;

  @Column({ type: 'jsonb' })
  place!: CandidatePlace;

  @Column({ type: 'integer' })
  estimatedCostPerPersonKrw!: number;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  @Column({ type: 'varchar', length: 20, default: CandidateStatus.ACTIVE })
  status!: CandidateStatus;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ type: 'uuid' })
  createdByParticipantId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
