import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { SolverSnapshot } from '../../../../application/ports/solver-contract';
import { CalculationJobStatus } from '../../../../domain/calculation/calculation-job';
import type { ScoreResultError } from '../../../../domain/calculation/score-result';

@Entity({ name: 'calculation_jobs' })
export class CalculationJob {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @Column({ type: 'uuid', unique: true })
  scoreResultId!: string;

  @Column({ type: 'jsonb' })
  snapshot!: SolverSnapshot;

  @Column({ type: 'varchar', length: 20 })
  status!: CalculationJobStatus;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'integer', default: 3 })
  maxAttempts!: number;

  @Column({ type: 'timestamptz' })
  nextAttemptAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  lastError!: ScoreResultError | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
