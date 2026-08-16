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
export type CandidateStatus = "ACTIVE" | "ARCHIVED";
export type AvailabilityStatus = "AVAILABLE" | "MAYBE" | "UNAVAILABLE";
export type TravelBurden = "EASY" | "NORMAL" | "HARD";
export type ScoreResultStatus =
  | "REQUESTED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "STALE";
export type MatchLevel = "FULL" | "PARTIAL" | "CONFLICTED" | "INCOMPLETE";
export type RecommendationStatus =
  | "INCOMPLETE"
  | "FULL_MATCH"
  | "PARTIAL_MATCH"
  | "NO_FULL_MATCH";
export type ScoringProfile = "MVP_NO_CONDITIONS";

export const MEETPOINT_TIMEZONE = "Asia/Seoul";

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

export type Candidate = {
  id: string;
  roomId: string;
  displayOrder: number;
  status: CandidateStatus;
  time: {
    startsAt: string;
    endsAt: string;
    timezone: string;
  };
  place: {
    name: string;
    address: string;
    area: string;
  };
  estimatedCostPerPersonKrw: number;
  tags: string[];
  version: number;
  archivedAt: string | null;
};

export type CreateCandidateInput = {
  displayOrder: number;
  time: Candidate["time"];
  place: Candidate["place"];
  estimatedCostPerPersonKrw: number;
  tags: string[];
};

export type CreatedCandidateResponse = {
  requestId: string;
  candidate: Candidate;
};

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
  participantStatus: ParticipantStatus;
  scoreResultStatus: "STALE";
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

export type RoomDetailsResponse = {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: Candidate[];
  myResponses: ParticipantResponsePayload[];
  latestScoreResult: null;
  decision: null;
};

export type ScoreResultMetadata = {
  scoringProfile: ScoringProfile;
  weights: {
    time: number;
    travelBurden: number;
    budget: number;
    preference: number;
  };
};

export type ScoreResultCandidate = {
  candidateId: string;
  rank: number;
  overallScore: number;
  eligible: boolean;
  matchLevel: MatchLevel;
  hardConflictCount: number;
  coverage: {
    submittedResponses: number;
    expectedResponses: number;
  };
  participantBreakdown: Array<{
    participantId: string;
    score: number;
    components: {
      time: number;
      travelBurden: number;
      budget: number;
      preference: number;
    };
    hardConflicts: string[];
    blockingIssues: string[];
    reasons: string[];
  }>;
  reasons: string[];
  conflicts: Array<{ participantId: string; code: string }>;
  blockingIssues: string[];
  explanationFlags: string[];
};

export type CalculationPayload = {
  id: string;
  roomId: string;
  status: ScoreResultStatus;
  policyVersion: string;
  scoringProfile: ScoringProfile;
  inputSnapshotHash: string;
  participantCount: number;
  candidateCount: number;
  metadata: ScoreResultMetadata;
  coverage: {
    respondedParticipants: number;
    totalParticipants: number;
    submittedResponses: number;
    expectedResponses: number;
  };
  recommendationStatus: RecommendationStatus | null;
  recommendationWarnings: string[];
  ranking: string[];
  candidates: ScoreResultCandidate[];
  createdAt: string;
  completedAt: string | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

export type StartCalculationResponse = {
  requestId: string;
  calculation: Pick<
    CalculationPayload,
    "id" | "roomId" | "status" | "policyVersion" | "scoringProfile" | "createdAt"
  >;
  pollUrl: string;
};

export type CalculationResponse = {
  requestId: string;
  calculation: CalculationPayload;
};

export type LatestScoreResultResponse = {
  requestId: string;
  scoreResult: CalculationPayload;
};

export type RoomApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
};

export class RoomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "RoomApiError";
  }
}

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_SERVER_BASE_URL ??
  "http://localhost:3001"
).replace(/\/$/, "");

const ROOM_TOKEN_STORAGE_PREFIX = "meetpoint:room-token:";
const ROOM_PARTICIPANT_STORAGE_PREFIX = "meetpoint:room-participant:";

function getRoomError(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const error = (payload as Partial<RoomApiErrorPayload>).error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if (
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.requestId !== "string" ||
    typeof error.details !== "object" ||
    error.details === null
  ) {
    return undefined;
  }

  return error;
}

async function request<T>(path: string, options: RequestInit = {}) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
    });
  } catch {
    throw new RoomApiError("서버에 연결할 수 없습니다.", 0, "NETWORK_ERROR");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = getRoomError(payload);

    throw new RoomApiError(
      error?.message ?? "요청을 처리하지 못했습니다.",
      response.status,
      error?.code,
      error?.requestId,
    );
  }

  return payload as T;
}

export function createRoom(input: CreateRoomInput) {
  return request<CreatedRoomResponse>("/api/v1/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function joinRoom(
  roomCode: string,
  input: JoinParticipantInput,
) {
  return request<JoinedParticipantResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomCode)}/participants`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getRoom(roomId: string, token: string) {
  return request<RoomDetailsResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function startCalculation(
  roomId: string,
  token: string,
  clientRequestId: string,
) {
  return request<StartCalculationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/calculations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientRequestId }),
    },
  );
}

export function getCalculation(
  roomId: string,
  calculationId: string,
  token: string,
) {
  return request<CalculationResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/calculations/${encodeURIComponent(calculationId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function getLatestScoreResult(roomId: string, token: string) {
  return request<LatestScoreResultResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/score-results/latest`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function createCandidate(
  roomId: string,
  token: string,
  input: CreateCandidateInput,
) {
  return request<CreatedCandidateResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/candidates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function upsertParticipantResponse(
  roomId: string,
  participantId: string,
  candidateId: string,
  token: string,
  input: UpsertParticipantResponseInput,
) {
  return request<UpsertedParticipantResponse>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participantId)}/responses/${encodeURIComponent(candidateId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export function getRoomTokenStorageKey(roomId: string) {
  return `${ROOM_TOKEN_STORAGE_PREFIX}${roomId}`;
}

export function getRoomParticipantStorageKey(roomId: string) {
  return `${ROOM_PARTICIPANT_STORAGE_PREFIX}${roomId}`;
}
