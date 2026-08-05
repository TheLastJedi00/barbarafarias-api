import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IdentityToolkitClient } from './identity-toolkit.client';
import { EmailCooldownService } from './email-cooldown.service';
import { UserRepository } from '../users/user.repository';

@Module({
  imports: [
    // Explícito, e não herdado do `isGlobal` do app: o `IdentityToolkitClient`
    // depende do ConfigService, e sem isto o módulo só falha ao ser montado
    // fora do AppModule — em teste, ou no dia em que o `isGlobal` mudar.
    ConfigModule,
    // Registrado aqui, e não no AppModule, porque o `AuthController` é o único
    // consumidor: o `ThrottlerGuard` **não** é global (spec 016 Task 76) — se
    // fosse, os webhooks de pagamento tomariam 429 numa rajada legítima de
    // eventos, e o efeito seria pagamento não processado.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    IdentityToolkitClient,
    EmailCooldownService,
    // Provido aqui, e não via UserModule, porque UserModule já importa
    // AuthModule — importar de volta criaria ciclo. O repositório é stateless
    // sobre o token global do Firestore, então a segunda instância é
    // inofensiva (mesmo padrão do BillingModule).
    UserRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
