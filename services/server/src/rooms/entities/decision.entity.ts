import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Participant } from '../../participants/entities/participant.entity';
import { Candidate } from './candidate.entity';
import { Room } from './room.entity';
import { ScoreResult } from './score-result.entity';

export enum DecisionStatus {
  CONFIRMED = 'CONFIRMED',
  REOPENED = 'REOPENED',
  SUPERSEDED = 'SUPERSEDED',
}

@Entity({ name: 'decisions' })
@Index('IDX_decisions_room_status', ['roomId', 'status'])
@Index('IDX_decisions_room_confirmed_at', ['roomId', 'confirmedAt'])
@Index('IDX_decisions_room_score_result', ['roomId', 'scoreResultId'])
export class Decision {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @Column({ type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => Candidate, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'candidateId', referencedColumnName: 'id' })
  candidate!: Candidate;

  @Column({ type: 'uuid' })
  scoreResultId!: string;

  @ManyToOne(() => ScoreResult, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'scoreResultId', referencedColumnName: 'id' })
  scoreResult!: ScoreResult;

  @Column({ type: 'uuid' })
  decidedByParticipantId!: string;

  @ManyToOne(() => Participant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decidedByParticipantId', referencedColumnName: 'id' })
  decidedByParticipant!: Participant;

  @Column({ type: 'varchar', length: 20 })
  status!: DecisionStatus;

  @Column({ type: 'boolean' })
  acknowledgeIssues!: boolean;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamptz' })
  confirmedAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  replacedDecisionId!: string | null;

  @ManyToOne(() => Decision, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replacedDecisionId', referencedColumnName: 'id' })
  replacedDecision!: Decision | null;

  @Column({ type: 'timestamptz', nullable: true })
  reopenedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  reopenReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
