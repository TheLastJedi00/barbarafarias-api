import { Module } from '@nestjs/common';
import { UserModule } from './users/user.module';
import { SupplyModule } from './supply/application/supply.module';
import { ConfigModule } from '@nestjs/config';
import { TeacherModule } from './teacher/application/teacher.module';
import { AuthModule } from './auth/auth.module';
import { VideoModule } from './video/video.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    UserModule, SupplyModule, TeacherModule, AuthModule, VideoModule ]
})
export class AppModule {}
