import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

const ERROR_MESSAGES = {
  INVALID_JSON: '요청 본문이 올바른 JSON 형식이 아닙니다.',
  VALIDATION_ERROR: '요청 입력값이 올바르지 않습니다.',
  MISSING_TOKEN: 'Room 접근 토큰이 필요합니다.',
  INVALID_TOKEN: '유효하지 않은 Room 접근 토큰입니다.',
  TOKEN_EXPIRED: 'Room 접근 토큰이 만료되었습니다.',
  HOST_ONLY: '호스트만 수행할 수 있는 요청입니다.',
  PARTICIPANT_ONLY: '참여자만 수행할 수 있는 요청입니다.',
  FORBIDDEN: '이 요청을 수행할 권한이 없습니다.',
  ROOM_NOT_FOUND_OR_INVALID_CODE:
    '방을 찾을 수 없거나 유효하지 않은 방 코드입니다.',
  RESOURCE_NOT_FOUND: '요청한 Room 리소스를 찾을 수 없습니다.',
  ROOM_STATE_CONFLICT: '현재 Room 상태에서는 요청을 처리할 수 없습니다.',
  CANDIDATE_LIMIT_EXCEEDED: '활성 후보는 최대 5개까지 등록할 수 있습니다.',
  INTERNAL_ERROR: '서버 내부 오류가 발생했습니다.',
  CALCULATION_IN_PROGRESS: 'A calculation is already running for this Room.',
  PARTICIPANT_COUNT_OUT_OF_RANGE:
    'A calculation requires between 3 and 6 active participants.',
  NO_ACTIVE_CANDIDATES:
    'A calculation requires between 2 and 5 active candidates.',
  SCORE_RESULT_NOT_FOUND: 'No calculation result exists for this Room.',
  SOLVER_ERROR: 'The Solver returned a structured calculation error.',
  SOLVER_UNAVAILABLE: 'The Solver is unavailable or timed out.',
} as const;

type RoomErrorCode = keyof typeof ERROR_MESSAGES;

type RoomErrorResponse = {
  error: {
    code: RoomErrorCode;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRoomErrorCode(value: unknown): value is RoomErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, value)
  );
}

@Catch()
export class RoomsErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const responseRecord = isRecord(exceptionResponse)
      ? exceptionResponse
      : undefined;
    const code = this.resolveCode(status, exceptionResponse, responseRecord);
    const details = isRecord(responseRecord?.details)
      ? responseRecord.details
      : {};

    const body: RoomErrorResponse = {
      error: {
        code,
        message: ERROR_MESSAGES[code],
        details,
        requestId: `req_${randomUUID()}`,
      },
    };

    response.status(status).json(body);
  }

  private resolveCode(
    status: number,
    exceptionResponse: string | object | undefined,
    responseRecord?: Record<string, unknown>
  ): RoomErrorCode {
    const candidate =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (responseRecord?.code ?? responseRecord?.message);

    if (isRoomErrorCode(candidate)) {
      return candidate;
    }

    if (status === 400) {
      return 'VALIDATION_ERROR';
    }
    if (status === 401) {
      return 'INVALID_TOKEN';
    }
    if (status === 404) {
      return 'RESOURCE_NOT_FOUND';
    }
    if (status === 409) {
      return 'ROOM_STATE_CONFLICT';
    }

    return 'INTERNAL_ERROR';
  }
}
