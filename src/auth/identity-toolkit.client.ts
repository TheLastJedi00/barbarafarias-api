import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1';

/** Sessão emitida pelo Firebase, no formato que as nossas rotas devolvem. */
export interface FirebaseSession {
  idToken: string;
  refreshToken: string;
  /** Segundos até o ID Token expirar. O Firebase sempre manda 3600. */
  expiresIn: number;
  localId: string;
}

/**
 * Erro do Identity Toolkit com o código cru do Google e a mensagem já em
 * português. O código é preservado porque quem chama decide o que fazer com
 * ele — a rota de redefinição de senha, por exemplo, **engole**
 * `EMAIL_NOT_FOUND` de propósito para não virar um verificador de quem tem
 * conta aqui (spec 016 Task 75).
 */
export class IdentityToolkitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityToolkitError';
  }
}

/** Mensagens de tela, uma por código. O que não estiver aqui é erro nosso. */
const MESSAGES: Record<string, string> = {
  EMAIL_NOT_FOUND: 'E-mail ou senha incorretos.',
  INVALID_PASSWORD: 'E-mail ou senha incorretos.',
  INVALID_LOGIN_CREDENTIALS: 'E-mail ou senha incorretos.',
  INVALID_EMAIL: 'E-mail inválido.',
  USER_DISABLED: 'Conta desativada. Fale com a coordenação.',
  USER_NOT_FOUND: 'Sessão expirada. Entre novamente.',
  TOKEN_EXPIRED: 'Sessão expirada. Entre novamente.',
  INVALID_REFRESH_TOKEN: 'Sessão expirada. Entre novamente.',
  MISSING_REFRESH_TOKEN: 'Sessão expirada. Entre novamente.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Muitas tentativas. Tente mais tarde.',
  EMAIL_EXISTS: 'Já existe uma conta com esse e-mail.',
  WEAK_PASSWORD: 'A senha precisa ter ao menos 6 caracteres.',
};

/**
 * O que a tela mostra quando o problema é de **configuração**. Não pede para
 * tentar de novo de propósito: nenhuma tentativa passa enquanto ninguém mexer
 * na chave ou no projeto (spec 017).
 */
export const CONFIG_UNAVAILABLE_MESSAGE =
  'Login temporariamente indisponível. Já estamos verificando.';

/**
 * Motivos de recusa que o Google manda em `error.details[].reason` — o campo
 * legível por máquina. A `message` correspondente é prosa em inglês
 * ("Requests from referer \<empty\> are blocked.") e não serve como código:
 * foi exatamente ela que virou um "código" desconhecido e derrubou o login
 * inteiro num 500 mudo na spec 016.
 */
const CONFIG_REASONS: Record<string, string> = {
  API_KEY_HTTP_REFERRER_BLOCKED: 'CONFIG_API_KEY_BLOCKED',
  API_KEY_IP_ADDRESS_BLOCKED: 'CONFIG_API_KEY_BLOCKED',
  API_KEY_ANDROID_APP_BLOCKED: 'CONFIG_API_KEY_BLOCKED',
  API_KEY_IOS_APP_BLOCKED: 'CONFIG_API_KEY_BLOCKED',
  API_KEY_INVALID: 'CONFIG_API_KEY_INVALID',
  API_KEY_SERVICE_BLOCKED: 'CONFIG_API_KEY_SERVICE_BLOCKED',
  SERVICE_DISABLED: 'CONFIG_API_DISABLED',
};

/**
 * Onde mexer, por código. É o que separa um log que descreve o sintoma de um
 * que resolve o problema — e a chave dupla deste mapa é também a lista do que
 * conta como falha de configuração para o `toHttpException`.
 */
const CONFIG_HINTS: Record<string, string> = {
  CONFIG_API_KEY_BLOCKED:
    'a chave tem restrição de aplicativo (HTTP referrer ou IP) e uma chamada de servidor não manda Referer — use uma chave sem restrição de aplicativo, restrita por API',
  CONFIG_API_KEY_INVALID: 'a chave não existe mais no projeto ou está truncada',
  CONFIG_API_KEY_SERVICE_BLOCKED:
    'a restrição de API da chave não inclui Identity Toolkit API e Token Service API',
  CONFIG_API_DISABLED:
    'a API não está habilitada no projeto do Google Cloud (APIs e serviços → Ativadas)',
  CONFIG_PERMISSION_DENIED:
    'o Google recusou a chave sem detalhar o motivo — confira restrições e projeto',
  CONFIGURATION_NOT_FOUND:
    'o provedor de e-mail/senha não está ligado em Firebase Authentication → Sign-in method',
};

/** Falha de configuração é problema nosso, e nunca vira 401 nem 500. */
function isConfigCode(code: string): boolean {
  return code in CONFIG_HINTS;
}

/** O corpo de erro do Google, na parte que interessa aqui. */
interface GoogleError {
  message?: string;
  status?: string;
  details?: { reason?: string }[];
}

/** Lê o motivo estruturado da recusa, quando ele existe. */
function configCode(error: GoogleError | undefined): string | undefined {
  for (const detail of error?.details ?? []) {
    const mapped = CONFIG_REASONS[detail?.reason ?? ''];
    if (mapped) {
      return mapped;
    }
  }
  // Sem `reason` conhecido, o `status` ainda distingue "a chave não passou" de
  // "a senha não confere" — e é o bastante para não chamar isso de 500.
  return error?.status === 'PERMISSION_DENIED'
    ? 'CONFIG_PERMISSION_DENIED'
    : undefined;
}

/** Códigos que são recusa de credencial, não falha do serviço. */
const UNAUTHORIZED = new Set([
  'EMAIL_NOT_FOUND',
  'INVALID_PASSWORD',
  'INVALID_LOGIN_CREDENTIALS',
  'USER_DISABLED',
  'USER_NOT_FOUND',
  'TOKEN_EXPIRED',
  'INVALID_REFRESH_TOKEN',
  'MISSING_REFRESH_TOKEN',
]);

/**
 * Traduz o erro do Identity Toolkit no status HTTP correspondente.
 *
 * O padrão é **500**, não 401: chave inválida, provedor de e-mail/senha
 * desligado no console ou API fora não são culpa de quem está digitando a
 * senha, e devolver 401 nesses casos produziria uma tela de login que recusa
 * todo mundo sem nenhuma pista do motivo.
 *
 * Quando dá para nomear a falha de configuração, o status é **503**: 500 com
 * "tente novamente" instrui a repetir uma ação que não tem como funcionar até
 * alguém corrigir a chave ou o projeto (spec 017).
 */
export function toHttpException(error: IdentityToolkitError): HttpException {
  if (UNAUTHORIZED.has(error.code)) {
    return new UnauthorizedException(error.message);
  }
  if (isConfigCode(error.code)) {
    return new ServiceUnavailableException(error.message);
  }
  if (error.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
    // O Nest não traz uma exceção pronta para 429.
    return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error.code === 'EMAIL_EXISTS') {
    return new ConflictException(error.message);
  }
  return new InternalServerErrorException(
    'Não foi possível concluir a autenticação. Tente novamente.',
  );
}

/**
 * Fala com a REST API de identidade do Firebase (spec 016 Task 70).
 *
 * **Por que existe, já tendo o Admin SDK:** o Admin SDK cria contas e verifica
 * tokens, mas não valida senha nem dispara e-mail. Tudo que depende da senha
 * do usuário ou de um e-mail enviado pelo Firebase passa por aqui.
 */
@Injectable()
export class IdentityToolkitClient {
  private readonly logger = new Logger(IdentityToolkitClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Valida e-mail e senha, devolvendo a sessão. É o coração do login. */
  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<FirebaseSession> {
    const data = await this.post(
      `${IDENTITY_TOOLKIT}/accounts:signInWithPassword`,
      { email, password, returnSecureToken: true },
    );
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: Number(data.expiresIn),
      localId: data.localId,
    };
  }

  /**
   * Troca o refresh token por um ID Token novo. O endpoint é outro (e o
   * formato da resposta usa snake_case), por isso não passa pelo `post`.
   */
  async refresh(refreshToken: string): Promise<FirebaseSession> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const data = await this.request(`${SECURE_TOKEN}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: Number(data.expires_in),
      localId: data.user_id,
    };
  }

  /**
   * Pede ao Firebase que envie o e-mail de redefinição. O link, a página de
   * nova senha e a validade do código são dele — o template (idioma, remetente
   * e URL de retorno) é configurado no console, em Authentication → Templates.
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    await this.post(`${IDENTITY_TOOLKIT}/accounts:sendOobCode`, {
      requestType: 'PASSWORD_RESET',
      email,
    });
  }

  /**
   * Envia a verificação do endereço. Autenticado pelo ID Token, e não pelo
   * e-mail: é assim que o Firebase garante que só o dono da sessão dispara a
   * verificação da própria conta.
   */
  async sendVerificationEmail(idToken: string): Promise<void> {
    await this.post(`${IDENTITY_TOOLKIT}/accounts:sendOobCode`, {
      requestType: 'VERIFY_EMAIL',
      idToken,
    });
  }

  private post(url: string, body: unknown): Promise<any> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request(url: string, init: RequestInit): Promise<any> {
    const response = await fetch(`${url}?key=${this.apiKey()}`, init);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw this.toError(data);
    }
    return data;
  }

  private toError(data: any): IdentityToolkitError {
    const error = (data as { error?: GoogleError } | undefined)?.error;
    // O Google anexa detalhes ao código: "WEAK_PASSWORD : Password should be…".
    const raw = String(error?.message ?? 'UNKNOWN_ERROR');
    const code = configCode(error) ?? raw.split(':')[0].trim();

    if (isConfigCode(code)) {
      // Este log é o começo do plantão: diz o que o Google recusou **e** onde
      // mexer. Sem a segunda metade, quem lê fica com o sintoma na mão.
      this.logger.error(
        `Identity Toolkit recusou por configuração (${code}): ${raw} — ` +
          `${CONFIG_HINTS[code]}. Variável a conferir: FIREBASE_WEB_API_KEY.`,
      );
      return new IdentityToolkitError(code, CONFIG_UNAVAILABLE_MESSAGE);
    }

    const message = MESSAGES[code];

    if (!message) {
      // Código desconhecido é quase sempre configuração errada, e o corpo é a
      // única pista do que aconteceu — sem este log, o 500 seria mudo.
      this.logger.error(`Identity Toolkit recusou: ${raw}`);
    }
    return new IdentityToolkitError(code, message ?? 'Falha na autenticação.');
  }

  private apiKey(): string {
    const key = this.config.get<string>('FIREBASE_WEB_API_KEY');
    if (!key) {
      throw new InternalServerErrorException(
        'FIREBASE_WEB_API_KEY ausente: o login não pode ser processado.',
      );
    }
    return key;
  }
}
