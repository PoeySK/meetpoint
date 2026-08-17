import { SolverHttpClient } from './solver-http-client';
import { validateSolverResponse } from './solver-response-validator';
import {
  type SolverResponsePayload,
  type SolverSnapshot,
} from './solver-types';

export class SolverClient {
  private readonly httpClient = new SolverHttpClient();

  call(snapshot: SolverSnapshot): Promise<SolverResponsePayload> {
    return this.httpClient.call(snapshot);
  }

  validateResponse(
    snapshot: SolverSnapshot,
    response: SolverResponsePayload
  ): void {
    validateSolverResponse(snapshot, response);
  }
}

export { createInitialCoverage, createSolverSnapshot } from './solver-snapshot';
export { SolverCallError } from './solver-types';
export type { SolverResponsePayload, SolverSnapshot } from './solver-types';
