export enum ParticipantRole {
  HOST = 'HOST',
  MEMBER = 'MEMBER',
}

export enum ParticipantStatus {
  JOINED = 'JOINED',
  RESPONDED = 'RESPONDED',
  LEFT = 'LEFT',
  REMOVED = 'REMOVED',
}

export interface ParticipantRecord {
  id: string;
  roomId: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  tokenHash: string;
  tokenExpiresAt: Date;
  tokenRevokedAt: Date | null;
  joinedAt: Date;
  updatedAt: Date;
}

export function isActiveParticipant(participant: ParticipantRecord): boolean {
  return (
    participant.status === ParticipantStatus.JOINED ||
    participant.status === ParticipantStatus.RESPONDED
  );
}
