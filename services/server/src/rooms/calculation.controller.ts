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
import type { StartCalculationDto } from './dto/start-calculation.dto';
import { RoomCalculationService } from './calculation/room-calculation.service';
import { extractBearerToken } from './room-access';
import { RoomsErrorFilter } from './rooms-error.filter';

@Controller('api/v1/rooms')
@UseFilters(RoomsErrorFilter)
export class CalculationController {
  constructor(private readonly calculationService: RoomCalculationService) {}

  @Post(':roomId/calculations')
  @HttpCode(HttpStatus.ACCEPTED)
  startCalculation(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: StartCalculationDto
  ) {
    return this.calculationService.startCalculation(
      roomId,
      extractBearerToken(authorization),
      body
    );
  }

  @Get(':roomId/calculations/:calculationId')
  getCalculation(
    @Param('roomId') roomId: string,
    @Param('calculationId') calculationId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.calculationService.getCalculation(
      roomId,
      calculationId,
      extractBearerToken(authorization)
    );
  }

  @Get(':roomId/score-results/latest')
  getLatestScoreResult(
    @Param('roomId') roomId: string,
    @Headers('authorization') authorization?: string
  ) {
    return this.calculationService.getLatestScoreResult(
      roomId,
      extractBearerToken(authorization)
    );
  }
}
