export enum CandidateStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export type CandidateTime = {
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export type CandidatePlace = {
  name: string;
  address: string;
  area: string;
};

export interface CandidateRecord {
  id: string;
  roomId: string;
  displayOrder: number;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
  status: CandidateStatus;
  version: number;
  archivedAt: Date | null;
  createdByParticipantId: string;
  createdAt: Date;
  updatedAt: Date;
}
