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
    public readonly retryAfterSeconds?: number,
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

export async function request<T>(path: string, options: RequestInit = {}) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new RoomApiError("서비스에 연결할 수 없습니다.", 0, "NETWORK_ERROR");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = getRoomError(payload);

    if (response.status === 429) {
      const header = response.headers.get("Retry-After");
      const seconds = header && /^\d+$/.test(header.trim())
        ? Number(header.trim())
        : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : NaN;
      const retryAfterSeconds = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
      throw new RoomApiError(
        retryAfterSeconds
          ? `요청이 너무 많습니다. ${retryAfterSeconds}초 뒤에 다시 시도해 주세요.`
          : "요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.",
        429, "RATE_LIMITED", error?.requestId, retryAfterSeconds,
      );
    }

    throw new RoomApiError(
      error?.message ?? "요청을 처리하지 못했습니다.",
      response.status,
      error?.code,
      error?.requestId,
    );
  }

  return payload as T;
}
