import { Module } from '@nestjs/common';
import { UserModule } from './users/user.module';
import { SupplyModule } from './supply/supply.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { VideoModule } from './video/video.module';
import { PromptsModule } from './prompts/prompts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UserModule,
    SupplyModule,
    AuthModule,
    VideoModule,
    PromptsModule,
  ],
  providers: [],
})
export class AppModule {}
