import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';

/** Intervalo mínimo entre dois e-mails para o mesmo endereço. */
export const EMAIL_COOLDOWN_SECONDS = 60;

export const EMAIL_COOLDOWN_MESSAGE =
  'Já enviamos um e-mail há pouco. Aguarde um minuto e tente de novo.';

/**
 * Freio por endereço de e-mail (spec 016 Task 76).
 *
 * O limite por IP do throttler protege o servidor; este protege a **caixa de
 * entrada de uma pessoa**, que é o que um pedido de senha repetido ataca. São
 * problemas diferentes: quem quer encher a caixa de alguém troca de IP, e o
 * limite por IP não vê nada de errado nisso.
 *
 * O endereço é guardado como hash: sem isso, a coleção viraria uma lista de
 * e-mails digitados na tela de recuperação — inclusive de quem nem tem conta.
 */
@Injectable()
export class EmailCooldownService {
  private readonly logger = new Logger(EmailCooldownService.name);

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /** Lança 429 se este endereço recebeu um e-mail há menos de um minuto. */
  async enforce(
    email: string,
    seconds = EMAIL_COOLDOWN_SECONDS,
  ): Promise<void> {
    const ref = this.db.collection('emailCooldowns').doc(this.key(email));

    try {
      const snapshot = await ref.get();
      const last = snapshot.exists ? Number(snapshot.data()?.lastSentAt ?? 0) : 0;

      if (last && Date.now() - last < seconds * 1000) {
        throw new HttpException(
          EMAIL_COOLDOWN_MESSAGE,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await ref.set({ lastSentAt: Date.now() });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Banco indisponível não pode impedir alguém de recuperar a senha: o
      // limite por IP continua de pé, e o Firebase tem o freio dele.
      this.logger.warn(`Falha ao aplicar o intervalo de e-mail: ${error}`);
    }
  }

  private key(email: string): string {
    return createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
  }
}
