import { Role } from '../types/role';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';

/** Slot recorrente (dia da semana + hora), usado como reposição pré-combinada. */
export interface WeeklySlot {
  dayOfWeek: number; // 0=domingo … 6=sábado
  hour: number; // 8..20
}

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
