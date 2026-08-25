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
import type { CreateDecisionDto } from '../dto/create-decision.dto';
import type { ReopenDecisionDto } from '../dto/reopen-decision.dto';
import { ConfirmDecisionUseCase } from '../../../application/commands/confirm-decision.use-case';
import { ReopenDecisionUseCase } from '../../../application/commands/reopen-decision.use-case';
import { GetDecisionQuery } from '../../../application/queries/get-decision.query';
import {
  toCreateDecisionResponse,
  toDecisionResponse,
  toReopenDecisionResponse,
} from '../view-models/decision-response';
import { extractBearerToken } from '../auth/bearer-token';
import { RoomsErrorFilter } from '../filters/rooms-error.filter';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class DecisionController {
  constructor(
    private readonly confirmDecisionUseCase: ConfirmDecisionUseCase,
    private readonly reopenDecisionUseCase: ReopenDecisionUseCase,
    private readonly getDecisionQuery: GetDecisionQuery
  ) {}

  @Post(':roomId/decision')
  createDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDecisionDto
  ) {
    return this.confirmDecisionUseCase
      .execute(roomId, extractBearerToken(authorization), body)
      .then(toCreateDecisionResponse);
  }

  @Post(':roomId/decision/reopen')
  @HttpCode(HttpStatus.OK)
  reopenDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ReopenDecisionDto
  ) {
    return this.reopenDecisionUseCase
      .execute(roomId, extractBearerToken(authorization), body)
      .then(toReopenDecisionResponse);
  }

  @Get(':roomId/decision')
  getDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.getDecisionQuery
      .execute(roomId, extractBearerToken(authorization))
      .then(toDecisionResponse);
  }
}
