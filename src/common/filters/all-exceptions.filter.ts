import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Status carregado por erros de middleware Express (`http-errors`), que não são
 * `HttpException` do Nest. O caso concreto é o `PayloadTooLargeError` do
 * body-parser: ele traz `status: 413`, mas sem esta leitura o filtro o
 * classificava como 500 e o cliente recebia "Internal server error" — foi
 * exatamente o que cegou o diagnóstico do estouro em `/supplies/consolidate`.
 */
function statusFromHttpError(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const candidate =
    (exception as { status?: unknown; statusCode?: unknown }).status ??
    (exception as { statusCode?: unknown }).statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate <= 599
    ? candidate
    : null;
}

/**
 * Filtro global: normaliza qualquer exceção em uma resposta JSON consistente.
 * HttpExceptions preservam status/mensagem; erros de middleware Express têm o
 * status próprio respeitado; erros inesperados viram 500 e são logados com
 * stack. Evita que services precisem embrulhar erros em try/catch.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpErrorStatus = statusFromHttpError(exception);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (httpErrorStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : httpErrorStatus === HttpStatus.PAYLOAD_TOO_LARGE
          ? 'Conteúdo grande demais para esta requisição.'
          : httpErrorStatus !== null && exception instanceof Error
            ? exception.message
            : 'Internal server error';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body = typeof payload === 'string' ? { message: payload } : payload;

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...body,
    });
  }
}
