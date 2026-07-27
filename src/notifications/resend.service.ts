import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
}

/**
 * Envio de e-mail transacional. Deliberadamente à prova de falha: se a Resend
 * cair, estiver sem chave ou recusar o remetente, o erro é logado e a operação
 * de negócio segue (spec 010 RNF7) — o dashboard continua sendo a fonte da
 * verdade, o e-mail é conveniência.
 */
@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly client?: Resend;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('RESEND_FROM') ??
      'Bárbara Farias <no-reply@barbarafarias.com.br>';

    if (apiKey) {
      this.client = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY ausente: notificações por e-mail desativadas.',
      );
    }
  }

  async send(message: EmailMessage): Promise<boolean> {
    const recipients = message.to.filter(Boolean);
    if (!this.client || recipients.length === 0) {
      return false;
    }

    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to: recipients,
        subject: message.subject,
        html: message.html,
      });
      if (error) {
        this.logger.error(`Resend recusou o envio: ${JSON.stringify(error)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Falha ao enviar e-mail "${message.subject}": ${String(error)}`,
      );
      return false;
    }
  }
}
