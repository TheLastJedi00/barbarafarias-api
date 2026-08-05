import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Auth } from 'firebase-admin/auth';
import { AuthRepository } from './auth.repository';
import { BcryptService } from './bcrypt.service';
import { AuthUser } from './entities/auth-user.entity';
import {
  FirebaseSession,
  IdentityToolkitClient,
  IdentityToolkitError,
  toHttpException,
} from './identity-toolkit.client';
import { EmailCooldownService } from './email-cooldown.service';
import { FIREBASE_AUTH } from '../firestore/firebase-auth.module';
import { Role, resolveRole } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRepository } from '../users/user.repository';

/** O que as rotas de sessão devolvem. `access_token` é o ID Token do Firebase. */
export interface SessionResponse {
  access_token: string;
  refresh_token: string;
  /** Segundos até o ID Token expirar — sempre 3600 no Firebase. */
  expires_in: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    private readonly identity: IdentityToolkitClient,
    private readonly authRepository: AuthRepository,
    private readonly bcryptService: BcryptService,
    private readonly userRepository: UserRepository,
    private readonly cooldown: EmailCooldownService,
  ) {}

  /**
   * Valida a senha no Firebase e devolve a sessão (spec 016 Task 71).
   *
   * A senha não fica em lugar nenhum do nosso lado: quem a guarda e confere é
   * o Firebase, e este serviço só a repassa.
   */
  async login(email: string, password: string): Promise<SessionResponse> {
    const session = await this.run(() =>
      this.identity.signInWithPassword(email, password),
    );
    return this.toResponse(await this.ensureRoleClaim(session));
  }

  /**
   * Troca o refresh token por um ID Token novo (spec 016 Task 73). É o que
   * compensa a validade de uma hora do ID Token e o que permite a sessão
   * sobreviver ao recarregamento da página.
   */
  async refresh(refreshToken: string): Promise<SessionResponse> {
    const session = await this.run(() => this.identity.refresh(refreshToken));
    return this.toResponse(await this.ensureRoleClaim(session));
  }

  /**
   * Invalida **todos** os refresh tokens da pessoa (spec 016 Task 74).
   *
   * Enquanto o token vivia só na memória do navegador, esquecê-lo bastava.
   * Agora que o refresh token sobrevive ao fechamento da aba, sem isto "sair"
   * seria só uma formalidade — e não haveria como cortar o acesso de um
   * aparelho perdido.
   */
  async logout(uid: string): Promise<void> {
    try {
      await this.auth.revokeRefreshTokens(uid);
    } catch (error) {
      // Sair não pode falhar: quando chega aqui o front já descartou os tokens.
      this.logger.warn(`Falha ao revogar sessões de ${uid}: ${error}`);
    }
  }

  /**
   * Verifica o ID Token e monta o usuário que o `AuthGuard` injeta no request
   * (spec 016 Task 72).
   *
   * Sem `checkRevoked`: ele custa uma ida à rede **por requisição**, e derrubar
   * uma sessão revogada até uma hora antes não paga esse preço num app onde o
   * próprio token já expira em uma hora.
   */
  async verifyIdToken(token: string): Promise<AuthenticatedUser> {
    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      sub: decoded.uid,
      email: decoded.email ?? '',
      // A claim é o caminho normal; o banco é a rede de segurança para um token
      // emitido antes de o papel existir. Deixar `undefined` chegar ao
      // RolesGuard viraria um 403 sem explicação nenhuma.
      role: (decoded.role as Role) ?? (await this.resolveUserRole(decoded.uid)),
      emailVerified: decoded.email_verified === true,
    };
  }

  /**
   * Pede ao Firebase o e-mail de redefinição (spec 016 Task 75).
   *
   * **Nunca revela se o e-mail existe.** Uma resposta diferente por caso
   * transformaria a rota num verificador de quem estuda aqui, e é justamente
   * quem não tem conta que descobriria isso primeiro. Erro de infraestrutura,
   * por outro lado, sobe: uma chave errada ficaria indistinguível de um envio
   * bem-sucedido, e ninguém notaria que o botão parou de funcionar.
   */
  async sendPasswordReset(email: string): Promise<void> {
    await this.cooldown.enforce(email);
    try {
      await this.identity.sendPasswordResetEmail(email);
    } catch (error) {
      if (
        error instanceof IdentityToolkitError &&
        (error.code === 'EMAIL_NOT_FOUND' || error.code === 'INVALID_EMAIL')
      ) {
        this.logger.debug(`Redefinição pedida para e-mail inexistente.`);
        return;
      }
      throw error instanceof IdentityToolkitError
        ? toHttpException(error)
        : error;
    }
  }

  async registerCredentials(data: Partial<AuthUser>) {
    const hashedPassword = await this.bcryptService.transform(data.password!);
    const authUser = new AuthUser({
      ...data,
      password: hashedPassword,
    });
    await this.authRepository.save(authUser);
  }

  async removeCredentials(id: string) {
    await this.authRepository.delete(id);
  }

  /**
   * Garante que o ID Token devolvido carregue o papel.
   *
   * Custom Claim só entra em token novo, então quando a claim falta (conta
   * criada fora do nosso fluxo, ou migração interrompida) não basta gravá-la:
   * é preciso reemitir o token pelo refresh, senão a pessoa entraria com um
   * token sem papel e o `RolesGuard` a barraria em tudo, em silêncio.
   */
  private async ensureRoleClaim(
    session: FirebaseSession,
  ): Promise<FirebaseSession> {
    const decoded = await this.auth.verifyIdToken(session.idToken);
    if (decoded.role) {
      return session;
    }

    const role = await this.resolveUserRole(session.localId);
    this.logger.log(`Gravando papel ausente (${role}) em ${session.localId}.`);
    await this.auth.setCustomUserClaims(session.localId, { role });
    return this.run(() => this.identity.refresh(session.refreshToken));
  }

  /**
   * **`users.role` é a fonte única do papel.** É o campo que todas as
   * consultas do servidor usam (listar professoras, achar as gerentes,
   * filtrar alunos) — o Firestore não faz join, então o papel precisa morar
   * no documento consultado.
   *
   * Aqui ele só é consultado quando o token **não** traz a claim; o caminho
   * normal lê o papel do próprio token, sem tocar no banco.
   *
   * Ordem: `users.role` → `isTeacher` (legado) → `student` (menor privilégio).
   */
  private async resolveUserRole(uid: string): Promise<Role> {
    const user = await this.userRepository.findById(uid);
    return resolveRole({ role: user?.role, isTeacher: user?.isTeacher });
  }

  private toResponse(session: FirebaseSession): SessionResponse {
    return {
      access_token: session.idToken,
      refresh_token: session.refreshToken,
      expires_in: session.expiresIn,
    };
  }

  /** Converte a falha do Identity Toolkit no status HTTP correspondente. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof IdentityToolkitError) {
        throw toHttpException(error);
      }
      throw error;
    }
  }
}
