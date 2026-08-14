import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Participant } from '../../participants/entities/participant.entity';
import { Candidate } from './candidate.entity';
import { Room } from './room.entity';

export enum AvailabilityStatus {
  AVAILABLE = 'AVAILABLE',
  MAYBE = 'MAYBE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum TravelBurden {
  EASY = 'EASY',
  NORMAL = 'NORMAL',
  HARD = 'HARD',
}

export enum ParticipantResponseStatus {
  SUBMITTED = 'SUBMITTED',
}

@Entity({ name: 'participant_responses' })
export class ParticipantResponse {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @Column({ type: 'uuid' })
  participantId!: string;

  @ManyToOne(() => Participant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participantId', referencedColumnName: 'id' })
  participant!: Participant;

  @Column({ type: 'uuid' })
  candidateId!: string;

  @ManyToOne(() => Candidate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId', referencedColumnName: 'id' })
  candidate!: Candidate;

  @Column({ type: 'varchar', length: 20 })
  availabilityStatus!: AvailabilityStatus;

  @Column({ type: 'varchar', length: 20 })
  travelBurden!: TravelBurden;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: ParticipantResponseStatus.SUBMITTED,
  })
  status!: ParticipantResponseStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
