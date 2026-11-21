/**
 * Questionário do comprador da loja (spec 033), respondido depois do pagamento
 * e usado no `[Dados do Aluno]` do material personalizado.
 *
 * **Chama-se `careerProfile`, e não `onboarding`,** porque "onboarding" já
 * nomeia o cadastro de entrada (`onboardedAt`, `missingOnboardingFields`, spec
 * 018). Um campo `onboarding` ao lado do `onboardedAt`, com outro significado,
 * seria lido errado pelo primeiro que passasse.
 *
 * Grava a **chave** de cada opção, e não o rótulo: o texto pode ser
 * reescrito sem migrar a base. O rótulo só aparece na hora de montar o prompt.
 */

export interface CareerOption {
  value: string;
  label: string;
}

export const WORK_AREAS: readonly CareerOption[] = [
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'educacao', label: 'Educação' },
  { value: 'negocios-vendas', label: 'Negócios/Vendas' },
  { value: 'financas', label: 'Finanças' },
  { value: 'direito', label: 'Direito' },
  { value: 'industria-engenharia', label: 'Indústria/Engenharia' },
  { value: 'turismo-hotelaria', label: 'Turismo/Hotelaria' },
  { value: 'comunicacao-marketing', label: 'Comunicação/Marketing' },
  { value: 'outra', label: 'Outra' },
];

export const CAREER_STAGES: readonly CareerOption[] = [
  { value: 'estudante', label: 'Estudante' },
  { value: 'primeiro-emprego', label: 'Primeiro emprego' },
  { value: 'pleno', label: 'Pleno' },
  { value: 'lideranca-gestao', label: 'Liderança/Gestão' },
  { value: 'transicao', label: 'Transição de carreira' },
  { value: 'autonomo', label: 'Autônomo/Empresário' },
];

export const ENGLISH_CONTACTS: readonly CareerOption[] = [
  { value: 'nenhum', label: 'Nenhum' },
  { value: 'filmes-musica', label: 'Só em filmes e música' },
  { value: 'le-no-trabalho', label: 'Leio no trabalho' },
  { value: 'fala-as-vezes', label: 'Falo às vezes' },
  { value: 'usa-todo-dia', label: 'Uso todo dia' },
];

export const WORK_AREA_VALUES = WORK_AREAS.map((o) => o.value);
export const CAREER_STAGE_VALUES = CAREER_STAGES.map((o) => o.value);
export const ENGLISH_CONTACT_VALUES = ENGLISH_CONTACTS.map((o) => o.value);

export interface CareerProfile {
  workArea: string;
  careerStage: string;
  englishContact: string;
  /** ISO — última vez que a pessoa respondeu ou editou. */
  answeredAt: string;
}

const labelOf = (options: readonly CareerOption[], value: string): string =>
  options.find((o) => o.value === value)?.label ?? value;

/** Rótulos legíveis para o prompt. Chave que saiu da lista volta crua. */
export function careerProfileLabels(
  profile: CareerProfile,
): Omit<CareerProfile, 'answeredAt'> {
  return {
    workArea: labelOf(WORK_AREAS, profile.workArea),
    careerStage: labelOf(CAREER_STAGES, profile.careerStage),
    englishContact: labelOf(ENGLISH_CONTACTS, profile.englishContact),
  };
}
