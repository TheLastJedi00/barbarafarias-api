import { Module } from '@nestjs/common';
import { UserModule } from './/users/application/user.module';
import { SupplyModule } from './supply/application/supply.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    UserModule, SupplyModule]
})
export class AppModule {}
