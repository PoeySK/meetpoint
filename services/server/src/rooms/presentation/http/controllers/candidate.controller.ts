import {
  Body,
  Controller,
  Delete,
  Headers,
  Patch,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { CreateCandidateDto } from '../dto/create-candidate.dto';
import type { UpdateCandidateDto } from '../dto/update-candidate.dto';
import { CreateCandidateUseCase } from '../../../application/commands/create-candidate.use-case';
import { UpdateCandidateUseCase } from '../../../application/commands/update-candidate.use-case';
import { ArchiveCandidateUseCase } from '../../../application/commands/archive-candidate.use-case';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import {
  toArchivedCandidateResponse,
  toCreatedCandidateResponse,
  toUpdatedCandidateResponse,
} from '../view-models/room-response';
import { validateCandidateVersion } from '../../../application/commands/input-validation';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class CandidateController {
  constructor(
    private readonly createCandidateUseCase: CreateCandidateUseCase,
    private readonly updateCandidateUseCase: UpdateCandidateUseCase,
    private readonly archiveCandidateUseCase: ArchiveCandidateUseCase
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

  @Patch(':roomId/candidates/:candidateId')
  update(
    @Param('roomId') roomId: string,
    @Param('candidateId') candidateId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('if-match-version') ifMatchVersion: string | undefined,
    @Body() body: UpdateCandidateDto
  ) {
    return this.updateCandidateUseCase
      .execute(
        roomId,
        candidateId,
        extractBearerToken(authorization),
        validateCandidateVersion(ifMatchVersion),
        body
      )
      .then(toUpdatedCandidateResponse);
  }

  @Delete(':roomId/candidates/:candidateId')
  archive(
    @Param('roomId') roomId: string,
    @Param('candidateId') candidateId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('if-match-version') ifMatchVersion: string | undefined
  ) {
    return this.archiveCandidateUseCase
      .execute(
        roomId,
        candidateId,
        extractBearerToken(authorization),
        validateCandidateVersion(ifMatchVersion)
      )
      .then(toArchivedCandidateResponse);
  }
}
