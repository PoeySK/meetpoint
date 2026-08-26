import { request } from '@/shared/api/http-client';
import type {
  UpsertParticipantConditionInput,
  UpsertedParticipantCondition,
} from '@/entities/participant-condition/model/types';

export function upsertParticipantCondition(
  roomId: string,
  participantId: string,
  token: string,
  input: UpsertParticipantConditionInput,
) {
  return request<UpsertedParticipantCondition>(
    `/api/v1/rooms/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(participantId)}/conditions`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
}
