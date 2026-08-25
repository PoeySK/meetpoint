import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import type { StartCalculationDto } from '../dto/start-calculation.dto';
import { StartCalculationUseCase } from '../../../application/commands/start-calculation.use-case';
import { GetCalculationQuery } from '../../../application/queries/get-calculation.query';
import { GetLatestScoreResultQuery } from '../../../application/queries/get-latest-score-result.query';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';
import {
  toCalculationResponse,
  toLatestScoreResultResponse,
  toStartCalculationResponse,
} from '../view-models/room-response';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class CalculationController {
  constructor(
    private readonly startCalculationUseCase: StartCalculationUseCase,
    private readonly getCalculationQuery: GetCalculationQuery,
    private readonly getLatestScoreResultQuery: GetLatestScoreResultQuery
  ) {}

  @Post(':roomId/calculations')
  @HttpCode(HttpStatus.ACCEPTED)
  startCalculation(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: StartCalculationDto
  ) {
    return this.startCalculationUseCase
      .execute(roomId, extractBearerToken(authorization), body)
      .then(toStartCalculationResponse);
  }

  @Get(':roomId/calculations/:calculationId')
  getCalculation(
    @Param('roomId') roomId: string,
    @Param('calculationId') calculationId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.getCalculationQuery
      .execute(roomId, calculationId, extractBearerToken(authorization))
      .then(toCalculationResponse);
  }

  @Get(':roomId/score-results/latest')
  getLatestScoreResult(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.getLatestScoreResultQuery
      .execute(roomId, extractBearerToken(authorization))
      .then(toLatestScoreResultResponse);
  }
}
