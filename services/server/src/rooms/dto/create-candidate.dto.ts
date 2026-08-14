export interface CreateCandidateDto {
  displayOrder: number;
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
}
