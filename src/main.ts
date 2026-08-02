import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { useContainer } from 'class-validator';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildCorsOptions } from './common/cors.config';

/**
 * Teto de corpo das requisições. O padrão do body-parser é 100 kB, e o
 * material de apoio consolidado (`POST /supplies/consolidate`) passa disso com
 * facilidade — 6 módulos x 4 tópicos já beiram os 100 kB, e acentos custam 2
 * bytes em UTF-8. 1 MB é deliberado, não conservadorismo: é o teto de um
 * documento do Firestore, então nada que caiba aqui é recusado na gravação.
 * (A Vercel corta em 4,5 MB por requisição de qualquer forma.)
 */
const BODY_LIMIT = '1mb';

// O Firebase é inicializado pela factory do FirestoreModule.
// Variáveis de ambiente carregadas via painel da Vercel ou .env local.
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // `bodyParser: false` é obrigatório: um `app.use(json(...))` adicional com o
  // parser embutido ligado não tem efeito — o embutido roda primeiro, marca
  // `req._body` e o segundo é ignorado, mantendo o limite de 100 kB.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // CORS antes do parser: um 413 disparado pelo body-parser precisa sair com
  // os headers de CORS, senão o browser reporta erro de CORS e o front nunca
  // enxerga o status real.
  app.enableCors(buildCorsOptions());

  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

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
  server.setTimeout(300000); // Timeout de 5 minutos

  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
