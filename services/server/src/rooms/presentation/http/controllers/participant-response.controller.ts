import {
  Body,
  Controller,
  Headers,
  Param,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { UpsertParticipantResponseDto } from '../dto/upsert-participant-response.dto';
import { UpsertParticipantResponseUseCase } from '../../../application/commands/upsert-participant-response.use-case';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import { toUpsertedParticipantResponse } from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class ParticipantResponseController {
  constructor(
    private readonly upsertParticipantResponseUseCase: UpsertParticipantResponseUseCase
  ) {}

  @Put(':roomId/participants/:participantId/responses/:candidateId')
  upsertParticipantResponse(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Param('candidateId') candidateId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpsertParticipantResponseDto
  ) {
    return this.upsertParticipantResponseUseCase
      .execute(
        roomId,
        participantId,
        candidateId,
        extractBearerToken(authorization),
        body
      )
      .then(toUpsertedParticipantResponse);
  }
}
