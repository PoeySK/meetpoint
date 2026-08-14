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

export type RoomDetailsResponse = {
  requestId: string;
  room: RoomPayload;
  hostParticipant: PublicParticipant;
  participants: PublicParticipant[];
  candidates: [];
  latestScoreResult: null;
  decision: null;
};

export class RoomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
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

function getErrorField(payload: unknown, field: "message" | "error") {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
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
    const message =
      getErrorField(payload, "message") ??
      getErrorField(payload, "error") ??
      "요청을 처리하지 못했습니다.";

    throw new RoomApiError(
      message,
      response.status,
      getErrorField(payload, "message"),
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

export function getRoomTokenStorageKey(roomId: string) {
  return `${ROOM_TOKEN_STORAGE_PREFIX}${roomId}`;
}
