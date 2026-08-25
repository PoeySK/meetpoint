import type { SolverResponsePayload, SolverSnapshot } from './solver-contract';

export interface SolverPort {
  solve(snapshot: SolverSnapshot): Promise<SolverResponsePayload>;
}

export const SOLVER = Symbol('SOLVER');
