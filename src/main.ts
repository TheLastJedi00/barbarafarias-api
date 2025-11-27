import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  
  // --- INICIALIZAÇÃO DO FIREBASE ---
  const localKeyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  let serviceAccount: ServiceAccount;

  if (fs.existsSync(localKeyPath)) {
    // LOCAL
    serviceAccount = require(localKeyPath);
    console.log('🔥 Firebase: Modo Local (Arquivo JSON detectado).');
  } else {
    // VERCEL
    console.log('☁️ Firebase: Modo Nuvem (Lendo Base64...).');
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    
    if (!base64) {
      throw new Error('FATAL: Credenciais do Firebase não encontradas (Nem arquivo, nem Base64).');
    }

    const buffer = Buffer.from(base64, 'base64');
    serviceAccount = JSON.parse(buffer.toString('utf-8'));
    console.log('✅ Firebase: Credenciais decodificadas com sucesso.');
  }

  // Erro de re-inicialização em hot-reload
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors(); 

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const configService = app.get(ConfigService);
  const port = process.env.PORT || configService.get<number>('PORT') || 8080;

  const server = await app.listen(port);
  // Timeout de 5 minutos 
  server.setTimeout(300000); 
  
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();