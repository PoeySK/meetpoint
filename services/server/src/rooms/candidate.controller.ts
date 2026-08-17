import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { CreateCandidateDto } from './dto/create-candidate.dto';
import { CandidateService } from './candidate.service';
import { extractBearerToken } from './room-access';
import { RoomsErrorFilter } from './rooms-error.filter';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Post(':roomId/candidates')
  createCandidate(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateCandidateDto
  ) {
    return this.candidateService.createCandidate(
      roomId,
      extractBearerToken(authorization),
      body
    );
  }
}
