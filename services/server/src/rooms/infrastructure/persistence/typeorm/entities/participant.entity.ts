import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Room } from './room.entity';
import { ParticipantResponse } from './participant-response.entity';
import {
  ParticipantRole,
  ParticipantStatus,
} from '../../../../domain/participant/participant';

@Entity({ name: 'participants' })
export class Participant {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  // 현재 구조에서 관계로 매핑되는 ID는 roomId뿐이다. roomId 컬럼을 관계의
  // 조인 컬럼으로 사용하여 participants.roomId에 외래 키 하나만 생성한다.
  @Column({ type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => Room, (room) => room.participants, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roomId', referencedColumnName: 'id' })
  room!: Room;

  @Column({ type: 'varchar', length: 30 })
  displayName!: string;

  @Column({ type: 'varchar', length: 20, default: ParticipantRole.MEMBER })
  role!: ParticipantRole;

  @Column({ type: 'varchar', length: 20, default: ParticipantStatus.JOINED })
  status!: ParticipantStatus;

  @Column({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  tokenExpiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  tokenRevokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(
    () => ParticipantResponse,
    (participantResponse) => participantResponse.participant
  )
  responses!: ParticipantResponse[];
}
