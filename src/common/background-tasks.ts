import { Injectable, Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

/**
 * Trabalho que continua depois da resposta (spec 037: o baralho do aluno é
 * gerado na matrícula sem a gerente esperar a IA).
 *
 * Na Vercel, `waitUntil` mantém a função viva até a promise terminar, dentro
 * do `maxDuration`. Fora dela (local, testes) é um no-op e a promise só corre
 * solta. A falha é registrada e engolida: quem pediu já recebeu a resposta.
 */
@Injectable()
export class BackgroundTasks {
  private readonly logger = new Logger(BackgroundTasks.name);

  run(label: string, task: () => Promise<unknown>): Promise<void> {
    const promise = Promise.resolve()
      .then(task)
      .then(
        () => undefined,
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`${label}: ${message}`);
        },
      );
    waitUntil(promise);
    return promise;
  }
}
