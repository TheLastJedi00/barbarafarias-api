import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { BcryptService } from './bcrypt.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { IdentityToolkitClient } from './identity-toolkit.client';
import { UserRepository } from '../users/user.repository';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '3h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    BcryptService,
    AuthRepository,
    IdentityToolkitClient,
    // Provido aqui, e não via UserModule, porque UserModule já importa
    // AuthModule — importar de volta criaria ciclo. O repositório é stateless
    // sobre o token global do Firestore, então a segunda instância é
    // inofensiva (mesmo padrão do BillingModule).
    UserRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
