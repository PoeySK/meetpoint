import {
  SolverCallError,
  type SolverResponsePayload,
  type SolverSnapshot,
} from './solver-types';
import { isSolverResponsePayload } from './solver-response-validator';

export class SolverHttpClient {
  async call(snapshot: SolverSnapshot): Promise<SolverResponsePayload> {
    const baseUrl = (
      process.env.SOLVER_BASE_URL ?? 'http://localhost:4000'
    ).replace(/\/$/, '');
    const timeoutMs = this.readPositiveIntegerEnv(
      'SOLVER_RESPONSE_TIMEOUT_MS',
      3000
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/v1/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (controller.signal.aborted) {
          throw new SolverCallError(
            'SOLVER_UNAVAILABLE',
            'Solver is unavailable or timed out.',
            true,
            { timeoutMs }
          );
        }
        throw new SolverCallError(
          'SOLVER_ERROR',
          'Solver returned a non-JSON response.',
          false,
          { status: response.status }
        );
      }

      if (!response.ok) {
        const payloadRecord = toRecord(payload);
        const errorRecord = toRecord(payloadRecord?.error);
        throw new SolverCallError(
          'SOLVER_ERROR',
          readString(errorRecord?.message) ?? 'Solver calculation failed.',
          readBoolean(errorRecord?.retryable) ?? false,
          {
            status: response.status,
            solverCode: readString(errorRecord?.code),
            solverDetails: toRecord(errorRecord?.details) ?? {},
          }
        );
      }

      if (!isSolverResponsePayload(payload)) {
        throw new SolverCallError(
          'SOLVER_ERROR',
          'Solver returned an invalid response.',
          false,
          {}
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof SolverCallError) {
        throw error;
      }
      throw new SolverCallError(
        'SOLVER_UNAVAILABLE',
        'Solver is unavailable or timed out.',
        true,
        { timeoutMs }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private readPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
