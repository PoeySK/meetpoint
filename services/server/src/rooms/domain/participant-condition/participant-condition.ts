export interface AvailabilityWindow {
  startsAt: string;
  endsAt: string;
}

export interface ParticipantPreferences {
  requiredTags: string[];
  preferredTags: string[];
  avoidTags: string[];
}

export interface ParticipantConditionRecord {
  participantId: string;
  roomId: string;
  availabilityWindows: AvailabilityWindow[];
  maxBudgetKrw: number | null;
  preferences: ParticipantPreferences;
  submittedAt: Date;
  updatedAt: Date;
}
