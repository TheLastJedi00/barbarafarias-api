import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FirebaseAuthGuard } from './guards/firebase.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';
import { BcryptService } from './bcrypt.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';

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
  providers: [AuthService, BcryptService, AuthRepository, FirebaseAuthGuard, RolesGuard],
  exports: [AuthService, BcryptService, AuthRepository, FirebaseAuthGuard, RolesGuard],
})
export class AuthModule {}
