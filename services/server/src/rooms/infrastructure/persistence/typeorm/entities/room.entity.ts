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

  // 의도적으로 단순 UUID 컬럼으로 저장하며 관계나 DB 외래 키를 만들지 않는다.
  @Column({ type: 'uuid' })
  hostParticipantId!: string;

  @Column({ type: 'integer', default: 6 })
  maxParticipants!: number;

  // 해당 엔티티가 추가되기 전까지는 nullable UUID 컬럼으로만 보관한다.
  @Column({ type: 'uuid', nullable: true })
  latestScoreResultId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  currentDecisionId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  // 반대편 관계는 별도의 외래 키를 만들지 않으며 외래 키는
  // Participant.roomId가 소유한다.
  @OneToMany(() => Participant, (participant) => participant.room)
  participants!: Participant[];

  @OneToMany(() => Candidate, (candidate) => candidate.room)
  candidates!: Candidate[];
}
