import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import * as fs from 'fs';
import * as path from 'path';

//Variáveis de ambiente carregadas pelo NestJS a partir do painel da Vercel ou do arquivo .env local
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // --- INICIALIZAÇÃO DO FIREBASE ---
  const localKeyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  let serviceAccount: ServiceAccount;

  if (fs.existsSync(localKeyPath)) {
    // LOCAL
    serviceAccount = require(localKeyPath);
    logger.log('Firebase: usando arquivo de credenciais local.');
  } else {
    // VERCEL
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (!base64) {
      throw new Error('FATAL: Credenciais do Firebase não encontradas.');
    }

    const buffer = Buffer.from(base64, 'base64');
    serviceAccount = JSON.parse(buffer.toString('utf-8'));
    logger.log('Firebase: credenciais carregadas do ambiente.');
  }

  // Erro de re-inicialização em hot-reload
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const app = await NestFactory.create(AppModule);

  // CORS
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        'https://dev.barbarafarias.com.br',
        'https://barbarafarias.com.br',
        'https://www.barbarafarias.com.br',
        'http://localhost:3000',
        'http://localhost:4200',
      ];

      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Origem bloqueada por CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const configService = app.get(ConfigService);
  const port = process.env.PORT || configService.get<number>('PORT') || 8080;

  const server = await app.listen(port, '0.0.0.0');
  // Timeout de 5 minutos
  server.setTimeout(300000);

  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();