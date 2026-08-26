export type AvailabilityWindow = {
  startsAt: string;
  endsAt: string;
};

export type ParticipantPreferences = {
  requiredTags: string[];
  preferredTags: string[];
  avoidTags: string[];
};

export type ParticipantCondition = {
  participantId: string;
  availabilityWindows: AvailabilityWindow[];
  maxBudgetKrw: number | null;
  preferences: ParticipantPreferences;
  submittedAt: string;
  updatedAt: string;
};

export type UpsertParticipantConditionInput = Omit<
  ParticipantCondition,
  'participantId' | 'submittedAt' | 'updatedAt'
>;

export type UpsertedParticipantCondition = {
  requestId: string;
  participantId: string;
  condition: ParticipantCondition;
  participantStatus: 'JOINED' | 'RESPONDED' | 'LEFT' | 'REMOVED';
  scoreResultStatus: 'STALE';
};
