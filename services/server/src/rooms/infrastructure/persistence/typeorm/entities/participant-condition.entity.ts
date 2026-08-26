import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Room } from './room.entity';
import type { AvailabilityWindow } from '../../../../domain/participant-condition/participant-condition';

@Entity({ name: 'participant_conditions' })
export class ParticipantCondition {
  @PrimaryColumn({ type: 'uuid' })
  participantId!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @ManyToOne(() => Participant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participantId', referencedColumnName: 'id' })
  participant!: Participant;

  @Column({ type: 'jsonb' })
  availabilityWindows!: AvailabilityWindow[];

  @Column({ type: 'integer', nullable: true })
  maxBudgetKrw!: number | null;

  @Column({ type: 'text', array: true, default: '{}' })
  requiredTags!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  preferredTags!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  avoidTags!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
