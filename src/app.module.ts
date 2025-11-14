import { Module } from '@nestjs/common';
import { UserModule } from './/users/application/user.module';

@Module({
  imports: [UserModule]
})
export class AppModule {}
