import { SetMetadata } from '@nestjs/common';

export const ALLOW_CANDIDATE_KEY = 'allowCandidate';

/**
 * Libera o candidato (spec 028) numa rota **sem** `@Roles`. O padrão é o
 * contrário: rota sem papel exigido é de quem faz parte da escola, e várias
 * delas tratam "não aluno" como equipe. Use só em rotas de sessão que valem
 * para qualquer conta (ex.: logout).
 */
export const AllowCandidate = () => SetMetadata(ALLOW_CANDIDATE_KEY, true);
