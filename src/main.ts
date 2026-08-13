import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Atrás da Vercel, `req.ip` é o IP do proxy — e sem esta linha o limite por
  // IP da spec 016 (Task 76) contaria o mundo inteiro num balde só: a terceira
  // pessoa a pedir a senha no mesmo minuto tomaria 429 sem ter feito nada.
  // `1` = confiar num único salto (o proxy da plataforma), não na cadeia toda,
  // que seria falsificável pelo próprio cliente.
  app.set('trust proxy', 1);

  // CORS antes do parser: um 413 disparado pelo body-parser precisa sair com
  // os headers de CORS, senão o browser reporta erro de CORS e o front nunca
  // enxerga o status real.
  app.enableCors(buildCorsOptions());

  // O corpo cru fica guardado ao lado do objeto já parseado porque conferência
  // de assinatura de webhook se faz sobre os **bytes que chegaram**: um
  // `JSON.stringify` do objeto não os reproduz — ordem de chaves, escapes e
  // espaços mudam.
  //
  // O webhook do Mercado Pago assina só os headers e o `data.id` da URL, então
  // hoje ninguém depende disto; fica porque é barato e porque a próxima
  // integração que assinar o corpo falharia 100% das vezes sem ele, inclusive
  // nas notificações legítimas.
  app.use(
    json({
      limit: BODY_LIMIT,
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Preenche `req.cookies`, de onde o `/auth/refresh` lê o refresh token
  // (spec 021). Sem assinatura: o valor é o token opaco do Firebase, que já é
  // verificado pelo Identity Toolkit — não há segredo de cookie neste projeto.
  app.use(cookieParser());

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
