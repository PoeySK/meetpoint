import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ParticipantRole,
  type ParticipantRecord,
} from '../../domain/participant/participant';
import {
  type CandidatePlace,
  type CandidateRecord,
  type CandidateTime,
} from '../../domain/candidate/candidate';
import {
  AvailabilityStatus,
  TravelBurden,
} from '../../domain/participant-response/participant-response';
import type { RoomRecord } from '../../domain/room/room-status';

export type NormalizedCreateRoomInput = {
  title: string;
  timezone: string;
  displayName: string;
};

export type NormalizedCandidateInput = {
  displayOrder: number;
  time: CandidateTime;
  place: CandidatePlace;
  estimatedCostPerPersonKrw: number;
  tags: string[];
};

export function validateCreateRoomInput(
  input: unknown
): NormalizedCreateRoomInput {
  const candidate = input as
    | {
        title?: unknown;
        timezone?: unknown;
        host?: { displayName?: unknown };
      }
    | null
    | undefined;
  const title =
    typeof candidate?.title === 'string' ? candidate.title.trim() : '';
  const timezone =
    typeof candidate?.timezone === 'string' ? candidate.timezone.trim() : '';
  const displayName =
    typeof candidate?.host?.displayName === 'string'
      ? candidate.host.displayName.trim()
      : '';

  if (!title || title.length > 80) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
  if (!displayName || displayName.length > 30) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  return { title, timezone, displayName };
}

export function validateJoinParticipantInput(input: unknown): string {
  const candidate = input as { displayName?: unknown } | null | undefined;
  const displayName =
    typeof candidate?.displayName === 'string'
      ? candidate.displayName.trim()
      : '';

  if (!displayName || displayName.length > 30) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  return displayName;
}

export function validateCandidateInput(
  input: unknown
): NormalizedCandidateInput {
  const candidate = input as
    | {
        displayOrder?: unknown;
        time?: {
          startsAt?: unknown;
          endsAt?: unknown;
          timezone?: unknown;
        };
        place?: {
          name?: unknown;
          address?: unknown;
          area?: unknown;
        };
        estimatedCostPerPersonKrw?: unknown;
        tags?: unknown;
      }
    | null
    | undefined;
  const startsAt = candidate?.time?.startsAt;
  const endsAt = candidate?.time?.endsAt;
  const timezone = candidate?.time?.timezone;
  const placeName = candidate?.place?.name;
  const address = candidate?.place?.address;
  const area = candidate?.place?.area;
  const tags = candidate?.tags;

  if (
    typeof candidate?.displayOrder !== 'number' ||
    !Number.isInteger(candidate.displayOrder) ||
    candidate.displayOrder < 1
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
  if (
    typeof startsAt !== 'string' ||
    typeof endsAt !== 'string' ||
    typeof timezone !== 'string'
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  if (
    typeof placeName !== 'string' ||
    placeName.trim().length < 1 ||
    placeName.trim().length > 120 ||
    typeof address !== 'string' ||
    address.trim().length < 1 ||
    address.trim().length > 120 ||
    typeof area !== 'string' ||
    area.trim().length < 1
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  if (
    typeof candidate.estimatedCostPerPersonKrw !== 'number' ||
    !Number.isInteger(candidate.estimatedCostPerPersonKrw) ||
    candidate.estimatedCostPerPersonKrw < 0 ||
    candidate.estimatedCostPerPersonKrw > 2_000_000
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  if (
    !Array.isArray(tags) ||
    tags.length > 10 ||
    tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  return {
    displayOrder: candidate.displayOrder,
    time: { startsAt, endsAt, timezone },
    place: {
      name: placeName.trim(),
      address: address.trim(),
      area: area.trim(),
    },
    estimatedCostPerPersonKrw: candidate.estimatedCostPerPersonKrw,
    tags: tags.map((tag) => (tag as string).trim().toUpperCase()),
  };
}

export function validateParticipantResponseInput(input: unknown): {
  availabilityStatus: AvailabilityStatus;
  travelBurden: TravelBurden;
  note: string | null;
} {
  const candidate = input as
    | {
        availabilityStatus?: unknown;
        travelBurden?: unknown;
        note?: unknown;
      }
    | null
    | undefined;
  const availabilityStatus = candidate?.availabilityStatus;
  const travelBurden = candidate?.travelBurden;

  if (
    !Object.values(AvailabilityStatus).includes(
      availabilityStatus as AvailabilityStatus
    ) ||
    !Object.values(TravelBurden).includes(travelBurden as TravelBurden)
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
  if (
    candidate?.note !== undefined &&
    candidate.note !== null &&
    (typeof candidate.note !== 'string' || candidate.note.trim().length > 300)
  ) {
    throw new BadRequestException('VALIDATION_ERROR');
  }

  return {
    availabilityStatus: availabilityStatus as AvailabilityStatus,
    travelBurden: travelBurden as TravelBurden,
    note: typeof candidate?.note === 'string' ? candidate.note.trim() : null,
  };
}

export function isDuplicateCandidate(
  candidate: CandidateRecord,
  input: NormalizedCandidateInput
): boolean {
  return (
    candidate.time.startsAt === input.time.startsAt &&
    candidate.time.endsAt === input.time.endsAt &&
    candidate.time.timezone === input.time.timezone &&
    candidate.place.name === input.place.name &&
    candidate.place.address === input.place.address &&
    candidate.place.area === input.place.area
  );
}

export function assertHostParticipant(
  room: RoomRecord,
  participant: ParticipantRecord
): void {
  if (
    room.hostParticipantId !== participant.id ||
    participant.roomId !== room.id ||
    participant.role !== ParticipantRole.HOST
  ) {
    throw new InternalServerErrorException(
      'Room host participant does not match the Room ownership record.'
    );
  }
}
