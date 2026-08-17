export type AvailabilityStatus = "AVAILABLE" | "MAYBE" | "UNAVAILABLE";
export type TravelBurden = "EASY" | "NORMAL" | "HARD";

export type UpsertParticipantResponseInput = {
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note?: string | null;
};

export type ParticipantResponsePayload = {
  id: string;
  participantId: string;
  candidateId: string;
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
  status: "SUBMITTED";
  submittedAt: string;
  updatedAt: string;
};

export type UpsertedParticipantResponse = {
  requestId: string;
  response: ParticipantResponsePayload;
  participantStatus: "JOINED" | "RESPONDED" | "LEFT" | "REMOVED";
  scoreResultStatus: "STALE";
};
