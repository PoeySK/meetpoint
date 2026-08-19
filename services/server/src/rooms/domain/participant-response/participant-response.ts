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

export interface ParticipantResponseRecord {
  id: string;
  roomId: string;
  participantId: string;
  candidateId: string;
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
  status: ParticipantResponseStatus;
  submittedAt: Date;
  updatedAt: Date;
}
