import { Module } from '@nestjs/common';
import { UserModule } from './/users/application/user.module';
import { SupplyModule } from './supply/application/supply.module';
import { ConfigModule } from '@nestjs/config';
import { TeacherModule } from './teacher/application/teacher.module';
import { AuthModule } from './auth/application/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    UserModule, SupplyModule, TeacherModule, AuthModule ]
})
export class AppModule {}
