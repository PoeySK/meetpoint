import type {
  CandidateRecord,
  CandidatePlace,
  CandidateStatus,
  CandidateTime,
} from '../../../domain/candidate/candidate';

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

export function toCandidatePayload(
  candidate: CandidateRecord
): CandidatePayload {
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
