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
   * aluno pagador no gateway — sem ele o AbacatePay recusa a cobrança.
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
   * Espelho do plano contratado (spec 012 Task 17). É desnormalização pura: a
   * verdade mora na coleção `subscriptions`, mas a listagem de alunos da
   * gerente precisa mostrar plano e situação sem uma leitura extra por linha.
   * Quem mantém sincronizado é o `SubscriptionService`.
   */
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  /**
   * Pagador no Stripe (`cus_…`), gravado na primeira contratação por cartão
   * (spec 014). Precisa ser persistido: `customers.create` **não** deduplica
   * por e-mail, então sem isto cada contratação criaria um cliente novo e o
   * histórico do aluno ficaria espalhado por vários no painel.
   */
  stripeCustomerId?: string;
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
