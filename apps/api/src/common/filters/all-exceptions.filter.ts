/**
 * GEOVENTRA — global exception filter.
 *
 * Normalises every error into the shared `ApiErrorBody` envelope so the web client has a
 * single error shape to handle.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@geoventra/contracts';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest & Request>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let error = 'Internal Server Error';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const rawMessage = record.message;
        if (Array.isArray(rawMessage)) {
          message = rawMessage.join('; ');
          details = rawMessage;
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
        if (typeof record.error === 'string') error = record.error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: request.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? '',
    };

    response.status(status).json(body);
  }
}
