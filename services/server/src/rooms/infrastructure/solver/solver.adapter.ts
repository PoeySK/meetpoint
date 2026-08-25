import { Injectable } from '@nestjs/common';
import type { SolverPort } from '../../application/ports/solver.port';
import { SolverHttpClient } from './solver-http-client';
import { validateSolverResponse } from './solver-response-validator';
import type {
  SolverResponsePayload,
  SolverSnapshot,
} from '../../application/ports/solver-contract';

@Injectable()
export class SolverAdapter implements SolverPort {
  constructor(private readonly httpClient: SolverHttpClient) {}

  async solve(snapshot: SolverSnapshot): Promise<SolverResponsePayload> {
    const response = await this.httpClient.call(snapshot);
    validateSolverResponse(snapshot, response);
    return response;
  }
}
