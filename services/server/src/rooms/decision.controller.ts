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
import type { CreateDecisionDto } from './dto/create-decision.dto';
import type { ReopenDecisionDto } from './dto/reopen-decision.dto';
import { DecisionService } from './decision.service';
import { extractBearerToken } from './room-access';
import { RoomsErrorFilter } from './rooms-error.filter';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class DecisionController {
  constructor(private readonly decisionService: DecisionService) {}

  @Post(':roomId/decision')
  createDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDecisionDto
  ) {
    return this.decisionService.createDecision(
      roomId,
      extractBearerToken(authorization),
      body
    );
  }

  @Post(':roomId/decision/reopen')
  @HttpCode(HttpStatus.OK)
  reopenDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ReopenDecisionDto
  ) {
    return this.decisionService.reopenDecision(
      roomId,
      extractBearerToken(authorization),
      body
    );
  }

  @Get(':roomId/decision')
  getDecision(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.decisionService.getDecision(
      roomId,
      extractBearerToken(authorization)
    );
  }
}
