import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Room } from './room.entity';

export enum ScoreResultStatus {
  REQUESTED = 'REQUESTED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STALE = 'STALE',
}

export interface ScoreResultCoverage {
  respondedParticipants: number;
  totalParticipants: number;
  submittedResponses: number;
  expectedResponses: number;
}

export interface ScoreResultMetadata {
  scoringProfile: string;
  weights: {
    time: number;
    travelBurden: number;
    budget: number;
    preference: number;
  };
}

export interface ScoreResultCandidate {
  candidateId: string;
  rank: number;
  overallScore: number;
  eligible: boolean;
  matchLevel: string;
  hardConflictCount: number;
  coverage: {
    submittedResponses: number;
    expectedResponses: number;
  };
  participantBreakdown: Array<{
    participantId: string;
    score: number;
    components: {
      time: number;
      travelBurden: number;
      budget: number;
      preference: number;
    };
    hardConflicts: string[];
    blockingIssues: string[];
    reasons: string[];
  }>;
  reasons: string[];
  conflicts: Array<{ participantId: string; code: string }>;
  blockingIssues: string[];
  explanationFlags: string[];
}

export interface ScoreResultError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

@Entity({ name: 'score_results' })
export class ScoreResult {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @Column({ type: 'varchar', length: 128 })
  clientRequestId!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ScoreResultStatus;

  @Column({ type: 'varchar', length: 32 })
  policyVersion!: string;

  @Column({ type: 'varchar', length: 64 })
  scoringProfile!: string;

  @Column({ type: 'varchar', length: 128 })
  inputSnapshotHash!: string;

  @Column({ type: 'integer' })
  participantCount!: number;

  @Column({ type: 'integer' })
  candidateCount!: number;

  @Column({ type: 'jsonb' })
  coverage!: ScoreResultCoverage;

  @Column({ type: 'varchar', length: 32, nullable: true })
  recommendationStatus!: string | null;

  @Column({ type: 'text', array: true, default: "'{}'" })
  recommendationWarnings!: string[];

  @Column({ type: 'jsonb' })
  ranking!: string[];

  @Column({ type: 'jsonb' })
  candidates!: ScoreResultCandidate[];

  @Column({ type: 'jsonb' })
  metadata!: ScoreResultMetadata;

  @Column({ type: 'jsonb', nullable: true })
  error!: ScoreResultError | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
