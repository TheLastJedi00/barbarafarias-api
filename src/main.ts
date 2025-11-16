import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ServiceAccount } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { useContainer } from 'class-validator';

async function bootstrap() {
  const serviceAccount = require('../serviceAccountKey.json') as ServiceAccount;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  useContainer(app.select(AppModule), { fallbackOnErrors: true }),
  await app.listen(process.env.PORT ?? 8080); 
}
bootstrap();
