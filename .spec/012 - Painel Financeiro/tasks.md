# Spec 012 — Painel Financeiro (Backend)

> **Objetivo:** APIs e coleções Firestore para assinaturas do aluno (3 planos), despesas de infraestrutura com histórico imutável, e dashboard financeiro da gerente (overview, anual, gráficos, metas).

- **Spec completa:** [`../../.specs/012 - Painel Financeiro/context.md`](../../.specs/012%20-%20Painel%20Financeiro/context.md)
- **Tasks completas:** [`../../.specs/012 - Painel Financeiro/tasks.md`](../../.specs/012%20-%20Painel%20Financeiro/tasks.md)

---

## RFs cobertos neste repo

- **RF1–5** (Aluno): `SubscriptionModule` — escolher plano, alterar método, cancelar, ver cobranças.
- **RF6–7** (Gerente): `ManagerFinanceService` — overview mensal/anual consolidado.
- **RF8** (Gerente): `RevenueGoalService` — metas de faturamento.
- **RF9–10** (Gerente): `InfraExpenseService` — despesas fixas com snapshots temporais (histórico imutável).
- **RF11** (Gerente): `ManagerFinanceService` — exclui horas da manager do cálculo de despesas.
- **RF12** (Gerente): `ManagerFinanceController` — endpoint `/finance/manager/chart` com dados formatados.

## Decisões técnicas

- **Coleção `subscriptions`:** docId = studentId (relação 1:1). Cronograma de parcelas (`charges[]`) embutido no documento.
- **Coleção `infrastructure_expenses`:** docId auto-gerado, ordenada por `effectiveFrom`. Cada alteração cria novo snapshot — meses anteriores preservam o valor que vigorava.
- **Doc `settings/revenue_goals_{year}`:** metas anuais e mensais da gerente.
- **`isPaying` retrocompatível:** alunos sem assinatura continuam com o `isPaying` manual. O campo passa a derivar do status da assinatura quando o aluno escolhe um plano.
- **Manager não é despesa:** reutiliza `isManager` do `TeacherClosing` existente no `BillingSummaryService`.

---

## Fases e Tasks

### Fase 1 — Entidades de Assinatura e Planos (`feat/012-fase-1-subscriptions`)

- **Task 1** — Criar `subscription.entity.ts`: entidade `Subscription`, enums (`SubscriptionPlan`, `SubscriptionStatus`, `PaymentMethod`), mapa de planos (MONTHLY R$240, SEMIANNUAL R$1.200/6x, ANNUAL R$2.280/12x), interface `Charge` (com `abacatePayId`).
  `feat: create Subscription entity and plan constants (Task 1)`

- **Task 1.5** — Configurar `.env` e instalar AbacatePay: `ABACATEPAY_API_KEY`, `ABACATEPAY_WEBHOOK_SECRET` e `DEV_MODE=true`.
  `chore: setup AbacatePay env vars and dependency (Task 1.5)`

- **Task 2** — Criar `subscription.repository.ts` e `coupon.repository.ts` (Firestore).
  `feat: create SubscriptionRepository and CouponRepository (Task 2)`

- **Task 3** — Criar DTOs: `ChoosePlanDto` (com cupom opcional), `CreateCouponDto`, etc.
  `feat: create subscription and coupon DTOs (Task 3)`

### Fase 2 — Endpoints de Assinatura do Aluno (`feat/012-fase-2-subscription-endpoints`)

- **Task 4** — Criar `subscription.service.ts` (integração AbacatePay): `choosePlan` (retorna dados Pix ou URL cartão), `getSubscription`, `changePaymentMethod`, `cancelSubscription`, `getUpcomingCharges`, `handleWebhook`.
  `feat: create SubscriptionService with AbacatePay integration (Task 4)`

- **Task 5** — Criar `subscription.controller.ts`: GET/POST/PATCH `/subscriptions/me`, GET `/subscriptions/:studentId`, POST `/webhooks/abacatepay`, e POST `/subscriptions/dev/mock-pay` (ativo apenas se DEV_MODE=true).
  `feat: create SubscriptionController with student routes and webhook (Task 5)`

- **Task 6** — Criar `subscription.module.ts` e registrar no `AppModule`.
  `feat: create SubscriptionModule and register in AppModule (Task 6)`

- **Task 7** — Testes unitários do `SubscriptionService`.
  `test: unit tests for SubscriptionService plan and charge logic (Task 7)`

### Fase 3 — Despesas de Infraestrutura com Histórico (`feat/012-fase-3-infra-expenses`)

- **Task 8** — Criar `infra-expense.entity.ts` com modelo de snapshots temporais.
  `feat: create InfraExpense entity with temporal snapshot model (Task 8)`

- **Task 9** — Criar `infra-expense.repository.ts` (coleção `infrastructure_expenses`): `save`, `findForMonth`, `findForYear`, `findAll`.
  `feat: create InfraExpenseRepository with temporal queries (Task 9)`

- **Task 10** — Criar `infra-expense.service.ts`: `setExpense`, `getCurrentExpense`, `getForMonth`, `getAnnualBreakdown`.
  `feat: create InfraExpenseService with snapshot resolution (Task 10)`

- **Task 11** — Testes unitários do `InfraExpenseService`.
  `test: unit tests for InfraExpenseService snapshot resolution (Task 11)`

### Fase 4 — Dashboard Financeiro da Gerente (`feat/012-fase-4-manager-finance`)

- **Task 12** — Criar `manager-finance.service.ts`: `getMonthlyOverview`, `getAnnualOverview`, `getChartData`.
  `feat: create ManagerFinanceService with overview and chart data (Task 12)`

- **Task 13** — Criar entidades `RevenueGoal` e `Coupon`, com seus repositories.
  `feat: create RevenueGoal and Coupon entities/repositories (Task 13)`

- **Task 14** — Criar `revenue-goal.service.ts` e `coupon.service.ts`.
  `feat: create RevenueGoalService and CouponService (Task 14)`

- **Task 15** — Criar `manager-finance.controller.ts`: endpoints `/finance/manager/*` (incluindo rotas de cupons).
  `feat: create ManagerFinanceController with dashboard and coupon endpoints (Task 15)`

- **Task 16** — Testes unitários do `ManagerFinanceService` e `RevenueGoalService`.
  `test: unit tests for ManagerFinanceService and RevenueGoalService (Task 16)`

### Fase 5 — Integração e Documentação (`feat/012-fase-5-integration`)

- **Task 17** — Adicionar `subscriptionPlan?` e `subscriptionStatus?` ao `User` entity.
  `feat: add subscription fields to User entity for denormalized queries (Task 17)`

- **Task 17.5** — Guards/Acesso: Bloquear aluno `isPaying=false` em aulas/artigos. Professora não agenda aluno inadimplente.
  `feat: enforce access control for non-paying students (Task 17.5)`

- **Task 18** — `isPaying` derivado do status da assinatura com retrocompatibilidade.
  `refactor: derive isPaying from subscription status with backward compat (Task 18)`

- **Task 19** — Criar `ManagerFinanceModule` e registrar no `AppModule`.
  `feat: create ManagerFinanceModule and wire dependencies (Task 19)`

- **Task 20** — Atualizar `README.md` com endpoints, coleções e regras.
  `docs: update README with Spec 012 endpoints and collections (Task 20)`

### Release

- **Task 42** — PR `release/012-painel-financeiro` → `dev`.
  `chore: open BE PR for Spec 012 (Task 42)`
