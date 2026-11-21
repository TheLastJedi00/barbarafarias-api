import { Role } from '../types/role';
import type { PlanTierId } from '../plan-tiers/plan-tier.model';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import type { CareerProfile } from './career-profile';

/** Slot recorrente (dia da semana + hora), usado como reposição pré-combinada. */
export interface WeeklySlot {
  dayOfWeek: number; // 0=domingo … 6=sábado
  hour: number; // 8..20
}

/** Ver `User.tier` (spec 032). */
export const USER_TIER = { MODULES: 'modules' } as const;
export type UserTier = (typeof USER_TIER)[keyof typeof USER_TIER];

export class User {
  id: string | undefined;
  fullName!: string;
  phone!: string;
  email!: string;
  isPaying!: boolean;
  /**
   * Espelho do `accessUntil` da assinatura (spec 023 P1). Fica aqui porque é
   * daqui que o guard lê: buscar a assinatura a cada rota protegida trocaria
   * uma leitura por duas em todo o sistema.
   */
  accessUntil?: string;
  /**
   * Acesso liberado à mão pela gerente (spec 025). Vale 30 dias por concessão,
   * porque o gesto dela é o registro de uma mensalidade recebida fora do
   * gateway — e um mês recebido vale um mês, como no PIX pré-pago (spec 024 §2).
   *
   * **Campo próprio, e não o `accessUntil` acima**, apesar de os dois
   * responderem "até quando este aluno tem acesso". O que os separa é quem
   * escreve: `accessUntil` é espelho da assinatura, e o `syncUser` o reescreve
   * a cada evento do gateway. Uma concessão manual gravada lá é apagada pelo
   * webhook seguinte sem erro nenhum — e a gerente só descobre quando a
   * professora não consegue agendar de novo. Quem soma as duas metades é o
   * `hasPaidAccess`.
   */
  manualAccessUntil?: string;
  /**
   * Plano de turma pago antes do início (spec 036): o acesso só abre nesta
   * data. Espelho da assinatura, escrito pelo `syncUser`.
   */
  accessFrom?: string | null;
  /** @deprecated substituído por `role`; mantido durante a migração (spec 010 §2.1). */
  isTeacher!: boolean;
  role?: Role;
  level!: string;
  objective!: string;
  prognosis!: string;
  /** URL pública no Firebase Storage; o arquivo é comprimido no cliente. */
  profileImageUrl?: string;
  /**
   * Só dígitos. Identifica as duas pontas do dinheiro: é dado fiscal da
   * professora (cadastrado pela gerente) e, desde a spec 013, o `taxId` do
   * aluno pagador no gateway — sem ele a cobrança é recusada.
   */
  cpf?: string;

  // --- professora (role manager/teacher) ---
  createdAt?: string; // ISO — data de cadastro
  bio?: string; // texto de apresentação exibido ao aluno
  pixKey?: string;
  cnpj?: string;
  hourlyRate?: number; // sobrepõe o valor-hora global
  phoneVisibleToStudent?: boolean;
  active?: boolean;

  // --- aluno (role student) ---
  /**
   * Por onde o aluno entrou (spec 032). `'modules'` = cadastrou-se pela loja e
   * compra módulos avulsos. **Ausente = aluno de plano**, cadastrado pela
   * gerente ou por convite — não há migração. Não muda se o comprador assinar
   * um plano depois: o que libera o painel do plano é o `isPaying`, não isto.
   */
  tier?: UserTier;
  /**
   * Respostas do questionário da loja (spec 033): área de trabalho, etapa na
   * carreira e contato com o inglês. Ausente = ainda não respondeu. Reaproveitado
   * nas compras seguintes e editável pelo próprio aluno.
   */
  careerProfile?: CareerProfile;
  /**
   * Quando o aluno terminou o onboarding (spec 018 Task 102). **Ausente = foi
   * convidado e ainda não completou o cadastro** — é o que o guard do front lê
   * para reter a pessoa na tela de boas-vindas e o que a gerente vê como
   * "convite pendente" na listagem.
   *
   * É campo próprio, e não `!fullName`, porque nome vazio também acontece por
   * outros motivos — e sem ele a gerente não distinguiria "convite enviado,
   * ninguém entrou" de "entrou e abandonou a tela no meio".
   */
  onboardedAt?: string;
  /**
   * Espelho do plano contratado (spec 012 Task 17). É desnormalização pura: a
   * verdade mora na coleção `subscriptions`, mas a listagem de alunos da
   * gerente precisa mostrar plano e situação sem uma leitura extra por linha.
   * Quem mantém sincronizado é o `SubscriptionService`.
   */
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  /**
   * Tier vigente do aluno (spec 035): espelho escrito pelo `syncUser` e pela
   * troca manual da gerente. Não confundir com `tier: 'modules'` (spec 032),
   * que diz que tipo de conta é — este diz qual serviço o assinante comprou.
   */
  planTier?: PlanTierId;
  /** A assinatura do tier foi encerrada fora da plataforma na fidelidade. */
  fidelityBrokenAt?: string;
  teacherId?: string;
  teacherName?: string;
  pendingTeacher?: boolean; // professora responsável foi desativada
  lessonsPerWeek?: number;
  meetUrl?: string; // sala fixa do aluno
  makeupSlot?: WeeklySlot;

  constructor(data: Partial<User>) {
    Object.assign(this, data);
  }
}
