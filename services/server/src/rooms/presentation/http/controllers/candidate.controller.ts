import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { CreateCandidateDto } from '../dto/create-candidate.dto';
import { CreateCandidateUseCase } from '../../../application/commands/create-candidate.use-case';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import { toCreatedCandidateResponse } from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class CandidateController {
  constructor(
    private readonly createCandidateUseCase: CreateCandidateUseCase
  ) {}

  @Post(':roomId/candidates')
  createCandidate(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateCandidateDto
  ) {
    return this.createCandidateUseCase
      .execute(roomId, extractBearerToken(authorization), body)
      .then(toCreatedCandidateResponse);
  }
}
