import { User } from './user.entity';
import { ROLES, resolveRole } from '../types/role';

/**
 * O que ainda falta a pessoa preencher para poder usar o sistema (spec 018).
 *
 * **Regra única, derivada dos campos** — e não do `onboardedAt`. O campo marca
 * quando alguém concluiu, mas boa parte da base é anterior a ele: usá-lo como
 * régua mandaria todo mundo para a tela de boas-vindas no próximo login,
 * inclusive quem já tem tudo preenchido.
 *
 * O conjunto muda com o papel, porque o motivo de cada campo muda:
 *
 * - **aluno** — nome, celular, CPF e objetivo. CPF e celular são o que o
 *   gateway exige do **pagador** (`assertPayableProfile`); o objetivo é o que
 *   orienta o material.
 * - **professora** — nome, celular, CPF e **chave PIX**. Ela não paga, ela
 *   recebe: o `pixKey` é o destino do repasse que o fechamento do mês emite.
 * - **gerente** — nada. Ela é quem conserta o que trava, e retê-la numa tela
 *   seria trancar a chave dentro de casa (spec 018 Fase 7, decisão nº 9).
 *
 * Mora aqui, e não no `UserService`, porque o módulo de professoras precisa da
 * mesma regra e não deveria importar o serviço de usuários inteiro para isso.
 */
export function missingOnboardingFields(user: User): string[] {
  const comuns = [
    ...(user.fullName ? [] : ['nome']),
    ...(user.phone ? [] : ['celular']),
    ...(user.cpf ? [] : ['CPF']),
  ];

  switch (resolveRole(user)) {
    case ROLES.STUDENT:
      return [...comuns, ...(user.objective ? [] : ['objetivo'])];
    case ROLES.TEACHER:
      return [...comuns, ...(user.pixKey ? [] : ['chave PIX'])];
    default:
      return [];
  }
}

/**
 * Se o onboarding **se aplica** a este papel.
 *
 * Existe porque lista vazia tem dois significados — "não falta nada" e "não se
 * aplica" — e confundir os dois carimba um onboarding que a pessoa nunca fez.
 * Foi assim que a primeira edição de perfil da professora ganhou um
 * `onboardedAt` na Fase 1, antes de ela ter onboarding de verdade.
 */
export function requiresOnboarding(user: User): boolean {
  const role = resolveRole(user);
  return role === ROLES.STUDENT || role === ROLES.TEACHER;
}

/**
 * Data de conclusão, ou `undefined` se ainda falta algo — ou se já concluiu.
 *
 * Nunca reescreve: é registro de **quando** aconteceu, não flag de completude.
 * Um patch posterior que apague o telefone não "desconclui" o onboarding; a
 * pessoa já entrou, e expulsá-la de volta por uma edição de perfil seria pior
 * que o problema que isso resolveria.
 */
export function onboardingCompletedAt(user: User): string | undefined {
  if (user.onboardedAt) return undefined;
  if (!requiresOnboarding(user)) return undefined;
  return missingOnboardingFields(user).length === 0
    ? new Date().toISOString()
    : undefined;
}
