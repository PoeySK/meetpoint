import type { Candidate } from "@/entities/candidate/model/types";
import type { ParticipantResponsePayload } from "@/entities/participant-response/model/types";

export type RoomStatus =
  | "DRAFT"
  | "OPEN"
  | "CALCULATING"
  | "CALCULATED"
  | "CONFIRMED"
  | "CLOSED";

export type ParticipantRole = "HOST" | "MEMBER";
export type ParticipantStatus =
  | "JOINED"
  | "RESPONDED"
  | "LEFT"
  | "REMOVED";

export type CreateRoomInput = {
  title: string;
  timezone: string;
  host: {
    displayName: string;
  };
};

export type JoinParticipantInput = {
  displayName: string;
};

export type RoomPayload = {
  id: string;
  roomCode: string;
  title: string;
  timezone: string;
  status: RoomStatus;
  hostParticipantId: string;
  maxParticipants: number;
  latestScoreResultId: string | null;
  currentDecisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicParticipant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
};

export type CreatedRoomResponse = {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  access: {
    hostToken: string;
    inviteUrl: string;
  };
};

export type JoinedParticipantResponse = {
  requestId: string;
  room: {
    id: string;
    roomCode: string;
    status: RoomStatus;
  };
  participant: PublicParticipant;
  access: {
    participantToken: string;
  };
};

export type ParticipantLifecycleResponse = {
  requestId: string;
  participant: PublicParticipant;
  roomStatus: RoomStatus;
};

export type RoomDetailsResponse = {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  currentParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: Candidate[];
  myResponses: ParticipantResponsePayload[];
  latestScoreResult: null;
  decision: null;
};
