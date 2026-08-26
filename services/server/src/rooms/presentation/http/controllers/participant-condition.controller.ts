import {
  Body,
  Controller,
  Headers,
  Param,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { UpsertParticipantConditionDto } from '../dto/upsert-participant-condition.dto';
import { UpsertParticipantConditionUseCase } from '../../../application/commands/upsert-participant-condition.use-case';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import { toUpsertedParticipantCondition } from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class ParticipantConditionController {
  constructor(
    private readonly upsertParticipantConditionUseCase: UpsertParticipantConditionUseCase
  ) {}

  @Put(':roomId/participants/:participantId/conditions')
  upsertParticipantCondition(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpsertParticipantConditionDto
  ) {
    return this.upsertParticipantConditionUseCase
      .execute(roomId, participantId, extractBearerToken(authorization), body)
      .then(toUpsertedParticipantCondition);
  }
}
