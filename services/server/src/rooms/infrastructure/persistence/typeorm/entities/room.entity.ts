import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Candidate } from './candidate.entity';
import { RoomStatus } from '../../../../domain/room/room-status';

@Entity({ name: 'rooms' })
export class Room {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 6, unique: true })
  roomCode!: string;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({ type: 'varchar', length: 20, default: RoomStatus.DRAFT })
  status!: RoomStatus;

  @Column({ type: 'uuid' })
  hostParticipantId!: string;

  @Column({ type: 'integer', default: 6 })
  maxParticipants!: number;

  @Column({ type: 'uuid', nullable: true })
  latestScoreResultId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  currentDecisionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Participant, (participant) => participant.room)
  participants!: Participant[];

  @OneToMany(() => Candidate, (candidate) => candidate.room)
  candidates!: Candidate[];
}
