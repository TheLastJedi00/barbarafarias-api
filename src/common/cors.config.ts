import { Logger } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_ORIGINS = [
  'https://dev.barbarafarias.com.br',
  'https://barbarafarias.com.br',
  'https://www.barbarafarias.com.br',
  'http://localhost:3000',
  'http://localhost:4200',
];

/**
 * Monta as opções de CORS. A allowlist vem de CORS_ORIGINS
 * (separada por vírgula); na ausência, usa os domínios padrão.
 */
export function buildCorsOptions(): CorsOptions {
  const logger = new Logger('CORS');
  const fromEnv = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowed = fromEnv?.length ? fromEnv : DEFAULT_ORIGINS;

  return {
    origin: (origin, callback) => {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`Origem bloqueada por CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  };
}
