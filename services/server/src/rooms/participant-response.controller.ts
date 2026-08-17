import {
  Body,
  Controller,
  Headers,
  Param,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { UpsertParticipantResponseDto } from './dto/upsert-participant-response.dto';
import { ParticipantResponseService } from './participant-response.service';
import { extractBearerToken } from './room-access';
import { RoomsErrorFilter } from './rooms-error.filter';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class ParticipantResponseController {
  constructor(
    private readonly participantResponseService: ParticipantResponseService
  ) {}

  @Put(':roomId/participants/:participantId/responses/:candidateId')
  upsertParticipantResponse(
    @Param('roomId') roomId: string,
    @Param('participantId') participantId: string,
    @Param('candidateId') candidateId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpsertParticipantResponseDto
  ) {
    return this.participantResponseService.upsertParticipantResponse(
      roomId,
      participantId,
      candidateId,
      extractBearerToken(authorization),
      body
    );
  }
}
