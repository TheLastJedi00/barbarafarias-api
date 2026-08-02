# Spec 012 — Painel Financeiro (Backend)

> **Objetivo:** APIs e coleções Firestore para assinaturas do aluno (3 planos), despesas de infraestrutura com histórico imutável, e dashboard financeiro da gerente (overview, anual, gráficos, metas).

- **Spec completa:** [`../../.specs/012 - Painel Financeiro/context.md`](../../.specs/012%20-%20Painel%20Financeiro/context.md)
- **Tasks completas:** [`../../.specs/012 - Painel Financeiro/tasks.md`](../../.specs/012%20-%20Painel%20Financeiro/tasks.md)

---

## RFs cobertos neste repo

- **RF1–5** (Aluno): `SubscriptionModule` — escolher plano (integrado ao AbacatePay para PIX/Cartão), alterar método, cancelar, ver cobranças.
- **RF6–7** (Gerente): `ManagerFinanceService` — overview mensal/anual consolidado.
- **RF8** (Gerente): `RevenueGoalService` — metas de faturamento.
- **RF9–10** (Gerente): `InfraExpenseService` — despesas fixas com snapshots temporais (histórico imutável).
- **RF11** (Gerente): `ManagerFinanceService` — exclui horas da manager do cálculo de despesas.
- **RF12** (Gerente): `ManagerFinanceController` — endpoint `/finance/manager/chart` com dados formatados.
- **RF13–14** (Acesso): Bloqueios para alunos inadimplentes (materiais, agendamento).
- **RF15–16** (Gerente/Aluno): Criação e aplicação de Cupons de desconto.

## Decisões técnicas

- **Integração AbacatePay:** Uso da SDK (v1 ou v2), criação de variáveis de ambiente `ABACATEPAY_API_KEY` e `ABACATEPAY_WEBHOOK_SECRET`.
- **Coleção `subscriptions`:** docId = studentId (relação 1:1). Cronograma de parcelas (`charges[]`) embutido no documento.
- **Coleção `infrastructure_expenses`:** docId auto-gerado, ordenada por `effectiveFrom`. Cada alteração cria novo snapshot — meses anteriores preservam o valor que vigorava.
- **Doc `settings/revenue_goals_{year}`:** metas anuais e mensais da gerente.
- **`isPaying` retrocompatível:** alunos sem assinatura continuam com o `isPaying` manual. O campo passa a derivar do status da assinatura quando o aluno escolhe um plano.
- **Manager não é despesa:** reutiliza `isManager` do `TeacherClosing` existente no `BillingSummaryService`.
