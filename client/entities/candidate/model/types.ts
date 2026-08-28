export type CandidateStatus = "ACTIVE" | "ARCHIVED";

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

export type UpdateCandidateInput = Partial<CreateCandidateInput>;

export type CreatedCandidateResponse = {
  requestId: string;
  candidate: Candidate;
};

export type CandidateMutationResponse = {
  requestId: string;
  candidate: Candidate;
  scoreResultStatus: "STALE";
};
