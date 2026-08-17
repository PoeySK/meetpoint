import { Candidate } from './entities/candidate.entity';
import type {
  CandidatePlace,
  CandidateStatus,
  CandidateTime,
} from './entities/candidate.entity';

export interface CandidatePayload {
  id: string;
  roomId: string;
  displayOrder: number;
  status: CandidateStatus;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
  version: number;
  archivedAt: Date | null;
}

export function toCandidatePayload(candidate: Candidate): CandidatePayload {
  return {
    id: candidate.id,
    roomId: candidate.roomId,
    displayOrder: candidate.displayOrder,
    status: candidate.status,
    time: candidate.time,
    place: candidate.place,
    estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
    tags: candidate.tags,
    version: candidate.version,
    archivedAt: candidate.archivedAt,
  };
}
