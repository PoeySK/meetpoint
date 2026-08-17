export function createClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
