export interface UpsertParticipantConditionDto {
  availabilityWindows: Array<{
    startsAt: string;
    endsAt: string;
  }>;
  maxBudgetKrw: number | null;
  preferences: {
    requiredTags: string[];
    preferredTags: string[];
    avoidTags: string[];
  };
}
