export interface UpsertParticipantResponseDto {
  candidateVersion: number;
  availabilityStatus: string;
  travelBurden: string;
  note?: string | null;
}
