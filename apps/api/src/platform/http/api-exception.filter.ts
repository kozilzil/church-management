import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ApiErrorDetail, ApiErrorResponse } from '@church/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type RequestWithId = Request & { id?: string };

interface ExceptionBody {
  code?: string;
  details?: ApiErrorDetail[];
  message?: string | string[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.readExceptionBody(exception);
    const validationErrors = Array.isArray(body.message) ? body.message : [];

    const payload: ApiErrorResponse = {
      error: {
        code:
          body.code ??
          (exception instanceof BadRequestException && validationErrors.length > 0
            ? 'VALIDATION_ERROR'
            : `HTTP_${status}`),
        message:
          validationErrors.length > 0
            ? '요청 값이 올바르지 않습니다.'
            : typeof body.message === 'string'
              ? body.message
              : status === HttpStatus.INTERNAL_SERVER_ERROR
                ? '서버에서 요청을 처리하지 못했습니다.'
                : '요청을 처리하지 못했습니다.',
        details: body.details ?? validationErrors.map((reason): ApiErrorDetail => ({ reason })),
        correlationId: request.id ?? randomUUID(),
      },
    };

    response.status(status).json(payload);
  }

  private readExceptionBody(exception: unknown): ExceptionBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : (response as ExceptionBody);
  }
}
