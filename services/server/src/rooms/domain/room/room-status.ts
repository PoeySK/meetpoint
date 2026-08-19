export enum RoomStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CALCULATING = 'CALCULATING',
  CALCULATED = 'CALCULATED',
  CONFIRMED = 'CONFIRMED',
  CLOSED = 'CLOSED',
}

export interface RoomRecord {
  id: string;
  roomCode: string;
  title: string;
  timezone: string;
  status: RoomStatus;
  hostParticipantId: string;
  maxParticipants: number;
  latestScoreResultId: string | null;
  currentDecisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
