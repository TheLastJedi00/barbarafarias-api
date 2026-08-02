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

---

## Decisões tomadas durante a execução

Registro obrigatório do §5.2.1.1 do `github-flow.md`: o que a spec não definia, o que foi
decidido e por quê. Estas decisões também abrem o corpo dos PRs.

### Backend

1. **Pacote do AbacatePay: `abacatepay-nodejs-sdk`, não `abacatepay`.**
   *A spec não definia:* o nome exato do pacote (a Task 1.5 dizia `npm install abacatepay`).
   *Decidido:* instalar `abacatepay-nodejs-sdk@1.6.0`. O pacote `abacatepay` no npm é uma CLI
   de terceiros para registrar um servidor MCP em IDEs — não tem nada da API de cobrança.
   O `abacatepay-nodejs-sdk` é o SDK oficial (MIT, org `abacatepay`) e traz `pixQrCode.create`,
   `pixQrCode.simulatePayment`, `billing.create` e `customer`.

2. **Gateway atrás de uma porta abstrata (`PaymentGateway`).**
   *A spec não definia:* como isolar o SDK do resto.
   *Decidido:* espelhar o `PayoutProvider` que o fechamento das professoras já usa — classe
   abstrata + implementação `AbacatePayGateway` registrada no módulo. Mantém o padrão vigente,
   deixa a regra de negócio testável sem rede e torna a troca de adquirente uma linha de módulo.

3. **Valores em reais internamente; centavos só na fronteira do gateway.**
   *A spec não definia:* a unidade monetária persistida.
   *Decidido:* reais, como o resto do sistema (`hourlyRate`, `total` do fechamento). A conversão
   para centavos (exigência da API do AbacatePay) acontece dentro do `PaymentGateway`.

4. **Cupons são nossos, não os do AbacatePay.**
   *A spec não definia:* se o cupom usaria o recurso de cupom do gateway.
   *Decidido:* coleção própria `coupons`. O cupom do AbacatePay modela percentual/fixo com
   limite de resgates — não tem noção de "vale por N parcelas desta assinatura", que é o
   requisito do RF15. Calcular no nosso lado também deixa o valor certo na tela antes de a
   cobrança existir (RF16).

5. **Cartão de crédito usa `methods: ['PIX']` na criação do checkout.**
   *A spec não definia:* como pedir cartão ao gateway.
   *Decidido:* a API do AbacatePay aceita hoje apenas `PIX` nesse campo (a própria SDK
   documenta). O checkout hospedado é quem oferece ao aluno as formas habilitadas na loja.
   Quando a API liberar `'CARD'`, é somar o valor no array — nada mais muda.

6. **Número de parcelas fixo no máximo do plano.**
   *A spec não definia:* se "até 6x / até 12x" permitiria o aluno escolher menos parcelas.
   *Decidido:* fixo no máximo (6x e 12x). O seletor de planos do RF2/Task 27 mostra três cards
   sem campo de parcelamento, e permitir a escolha dobraria a matemática do cupom sem pedido
   explícito. Abrir depois é aditivo.

7. **Plano mensal: 1 parcela conceitual, 6 renovações projetadas.**
   *A spec não definia:* como conciliar `installments` com um plano sem fim.
   *Decidido:* `installments: 1` (o que a Task 7 pede) e `charges` com 6 renovações à frente
   (§2). Cada renovação paga empurra mais uma no fim da fila, mantendo a janela cheia.

8. **Trocar de plano exige cancelar o atual antes.**
   *A spec não definia:* o que acontece ao escolher outro plano com assinatura ativa.
   *Decidido:* `400` pedindo o cancelamento. Trocar no meio exigiria pró-rata e estorno da
   parcela em curso — regra ausente da spec e a única alternativa que arrisca cobrar duas vezes
   o mesmo mês.

9. **Parcela zerada por cupom não vai ao gateway.**
   *A spec não definia:* o piso de valor.
   *Decidido:* o AbacatePay exige mínimo de R$ 1. Parcela que o cupom zera é confirmada
   localmente — não há o que cobrar, e o aluno não pode ficar travado num QR Code inválido.

10. **Falha do gateway não derruba a contratação.**
    *A spec não definia:* o comportamento quando o AbacatePay recusa ou está sem chave.
    *Decidido:* a assinatura é gravada e a resposta traz um campo `warning`. Mesma postura à
    prova de falha do `ResendService` (spec 010 RNF7): o plano registrado é a fonte da verdade,
    a cobrança é reemitida pela própria tela.

11. **Webhook autenticado pelo segredo na query string.**
    *A spec não definia:* o mecanismo (só citava `ABACATEPAY_WEBHOOK_SECRET`).
    *Decidido:* `?webhookSecret=` comparado ao env, como o AbacatePay entrega. Rota `@Public()`
    — é a única barreira entre um POST anônimo e uma assinatura ativa. O processamento é
    idempotente: o gateway reenvia até receber 200 e reprocessar não pode contar a parcela duas
    vezes.

12. **Rota de simulação: `POST /subscriptions/dev/mock-pay`, barrada no service.**
    *A spec não definia:* onde travar o `DEV_MODE`.
    *Decidido:* o `@Roles(STUDENT)` sozinho não impediria o uso em produção, então a checagem de
    `DEV_MODE=true` mora no service e devolve `403`. Quando há cobrança no gateway, a simulação
    passa por `pixQrCode.simulatePayment` — assim o caminho testado é o mesmo da produção.

13. **Receita do mês conta parcela já paga.**
    *A spec não definia:* se a parcela quitada sai da projeção.
    *Decidido:* continua contando. Ela é receita **daquele** mês; removê-la faria o faturamento
    passado encolher conforme o tempo passa, quebrando a comparação anual do RF7.

14. **Bloqueio de inadimplência: guard global anotado + serviço para o lado da professora.**
    *A spec não definia:* o mecanismo.
    *Decidido:* dois caminhos, porque são dois problemas. `ActivePlanGuard` (terceiro `APP_GUARD`,
    depois de auth e papel) roda nas rotas marcadas com `@RequiresActivePlan()` e só para alunos —
    resolve o RF13, em que o próprio aluno é quem pede. Para o RF14 o alvo é outro aluno, que só
    aparece no meio da regra (no corpo do pedido, na aula referenciada), então a checagem é o
    `PaymentAccessService`, chamado pelos services de agenda, reagendamento e avaliação.
    Rotas bloqueadas para o aluno: artigos (listagem e detalhe), material personalizado
    (`/supplies/*`), horário (`/agenda/student/:id`) e aulas (`/lessons/student/:id`,
    `:id/access`, `:id/student-cancel`, `:id/rating`). Perfil e `/subscriptions/*` seguem livres.

15. **Marcar presença continua liberado mesmo com aluno inadimplente.**
    *A spec não definia:* se "avaliar" incluía o registro de presença.
    *Decidido:* `POST /lessons/:id/attendance` fica livre. Presença é escrituração que alimenta o
    fechamento da professora (spec 010); travá-la puniria quem já deu a aula. O que bloqueia é a
    avaliação de evolução (`POST /students/:id/feedbacks`), que é serviço novo.

16. **`isPaying` enviado à mão é descartado quando o aluno tem assinatura.**
    *A spec não definia:* o que fazer com o `isPaying` do `UpdateUserDto` depois da Task 18.
    *Decidido:* `PATCH /users/:id` ignora o campo se o aluno tiver `subscriptionStatus`; os
    demais campos do mesmo PATCH continuam valendo. A edição manual seria desfeita na próxima
    cobrança de qualquer forma, e descartá-la evita que painel e barreira de acesso discordem.
    Aluno **sem** assinatura segue 100% no interruptor manual — a retrocompatibilidade do §3.

17. **Módulo `finance/` novo, `/finance/teacher/*` intocado.**
    *A spec não definia:* onde o painel da gerente moraria.
    *Decidido:* `src/finance/` com o `ManagerFinanceModule`, sob o prefixo `/finance/manager`.
    O `FinanceController` da professora continua no `BillingModule`. Separar por prefixo evita
    que uma rota nova aqui herde por engano a audiência de lá — os dados da gerente incluem PIX
    e a folha inteira.

18. **`BillingSummaryService` passou a ser exportado pelo `BillingModule`.**
    *A spec não definia:* como o painel da gerente leria a folha.
    *Decidido:* exportar o serviço existente em vez de recalcular. É a única alteração feita em
    código da spec 010, e é aditiva.

19. **`GET /finance/manager/infra` devolve `{ current, breakdown, history }`.**
    *A spec não definia:* o formato da resposta.
    *Decidido:* os três de uma vez, que é exatamente o que o `infra-expense-manager` (Task 37)
    precisa desenhar — valor vigente, os doze meses do ano e o histórico de reajustes — sem três
    requisições.

20. **`GET /subscriptions/plans` foi adicionado.**
    *A spec não definia:* de onde o seletor de planos leria os valores.
    *Decidido:* expor o catálogo pela API, para que preço e parcelas tenham uma fonte única.
    O frontend mantém uma cópia em `PLAN_OPTIONS` (Task 21) apenas como fallback de renderização.

21. **README do backend fica na branch de release, não na Fase 5.**
    *A spec não definia:* como conciliar a Task 20 com o §5.2.1 do `github-flow.md`.
    *Decidido:* seguir o fluxo do projeto, que é explícito — "toda branch de release atualiza o
    `README.md`… é o único ponto que toca o README — as fases não mexem nele". O conteúdo da
    Task 20 foi entregue na release, com a mensagem de commit da Task 20.

### Frontend

22. **Endpoint de validação de cupom criado para o RF16.**
    *A spec não definia:* de onde o seletor tiraria o valor do desconto para "recalcular
    instantaneamente" (a Task 27 dizia "chama API/Service (opcional) para validar").
    *Decidido:* criar `GET /subscriptions/coupons/:code` (papel `student`) devolvendo código,
    desconto e duração. Sem ele o valor só apareceria depois de contratar — tarde demais para
    decidir. A rota é autenticada e exige o código exato, então não expõe a tabela de
    descontos. Commit no backend: `feat: validate coupon endpoint…`.

23. **O seletor de planos também escolhe a forma de pagamento.**
    *A spec não definia:* de onde viria o `paymentMethod` do `choosePlan` (a Task 27 só emitia
    `{ plan, couponCode }`).
    *Decidido:* o `plan-selector` emite `{ plan, paymentMethod, couponCode }` num **segundo
    passo**, que abre depois de o plano ser escolhido. Sem isso o fluxo ficava incompleto; num
    passo só, cada card teria seis controles e no mobile a vitrine viraria formulário.

24. **`GET /subscriptions/plans` é a fonte; `PLAN_OPTIONS` é fallback.**
    *A spec não definia:* como conciliar a constante da Task 21 com os valores do backend.
    *Decidido:* a página busca o catálogo e cai na constante local se a chamada falhar. Preço e
    parcelas passam a ter uma fonte só; os bullets de venda e o destaque de "mais escolhido"
    continuam no frontend, que é onde texto de produto pertence.

25. **`shared/format/money.ts` compartilhado.**
    *A spec não definia:* onde ficaria a formatação monetária dos novos componentes.
    *Decidido:* um utilitário compartilhado, em vez de seis cópias de `toLocaleString` com risco
    de divergir. As páginas antigas mantêm as suas — migrá-las não é escopo desta spec.

26. **Paleta própria para os gráficos, validada para daltonismo.**
    *A spec não definia:* quais variações exatas de `--bf-primary`/`--bf-accent` usar.
    *Decidido:* três tokens novos (`--bf-chart-teachers`, `--bf-chart-infra`,
    `--bf-chart-revenue`) com passos próprios por tema. `--bf-primary` é quase preto no tema
    claro e viraria uma barra sem cor. A paleta foi validada (separação ΔE 11.5 no claro, 8.1 no
    escuro); o dourado fica abaixo de 3:1 contra a superfície clara, então **todo gráfico traz
    um "Ver como tabela"** — o alívio que a validação exige, e que também serve de fallback
    tabular no mobile (Task 39).

27. **Backend manda `colorToken` semântico, não cor literal.**
    *A spec não definia:* o formato de cor em `/finance/manager/chart`.
    *Decidido:* `primary`/`accent`/`success`, resolvidos para a variável CSS pelo componente —
    só o cliente sabe se está no tema claro ou escuro.

28. **Um eixo só no gráfico de Lucro × Despesas.**
    *A spec não definia:* como acomodar receita e despesa juntas.
    *Decidido:* eixo único. As duas são reais; um segundo eixo tornaria qualquer relação visual
    entre elas arbitrária. O lucro é o vão entre a linha da receita e o topo da pilha, sem uma
    quarta série.

29. **Ano dos gráficos separado do mês do fechamento.**
    *A spec não definia:* se o alternador de ano afetaria o fechamento das professoras.
    *Decidido:* dois seletores independentes — `year()` para gráficos/metas/infra e `month()`
    para o fechamento. Trocar de mês recarrega também a visão consolidada, para as duas leituras
    de "o mês" não discordarem na mesma tela.

30. **`GET /users/:id` resolve a inadimplência no detalhe da aula.**
    *A spec não definia:* de onde a professora leria o `isPaying` do aluno da aula.
    *Decidido:* buscar a ficha ao abrir o modal, em vez de desnormalizar o campo na aula. A aula
    é materializada a partir da grade e carregaria um retrato velho do pagamento. Se a busca
    falhar, os botões ficam **ativos** e o backend recusa — melhor do que travar quem está em dia.

31. **"Meu Plano" só aparece para o dono da conta.**
    *A spec não definia:* o comportamento do painel do aluno aberto por professora/gerente.
    *Decidido:* o botão é condicionado ao `sub` do token (o `studentGuard` barraria a professora
    de qualquer forma). O **aviso de inadimplência aparece para os dois**, com textos diferentes:
    para o aluno é o bloqueio, para a professora é o alerta do RF14.

32. **Botão de simulação do PIX sai do bundle de produção.**
    *A spec não definia:* como garantir que ele "nunca vá para produção".
    *Decidido:* `!environment.production`, resolvido em tempo de build pelo `fileReplacements` do
    Angular — o bloco é eliminado do bundle, não apenas escondido. O backend ainda barra a rota
    com `403` fora do `DEV_MODE`: duas travas independentes.

33. **README do frontend na branch de release.**
    Mesma razão da decisão 21: o §5.2.1 do `github-flow.md` reserva o README à release. O
    conteúdo da Task 41.5 foi entregue lá, com a mensagem de commit da Task 41.5.

---

## Fixes pós-implementação (na branch de release, antes do merge)

### Fix 1 — Inputs do painel financeiro sem padding nem borda arredondada (FE)

**Sintoma.** Os campos das seções de metas, infraestrutura e cupons — e o campo de cupom do
seletor de planos — apareciam sem espaçamento interno e com cantos retos, destoando de todo
o resto do produto.

**Causa.** `.bf-field`, em `styles.css`, carrega **apenas cores** (texto, fundo, borda,
placeholder). Toda a geometria (`rounded-xl px-3 py-2 w-full transition-colors
focus:outline-none`) mora em `controlClasses()` (`shared/form/field-styles.ts`), que os
campos atômicos de `shared/form/fields` aplicam junto. Os `<input>` crus desta spec foram
escritos com `class="bf-field bf-field--light w-full"` e herdaram só a cor.

**Correção.** Os quatro componentes com `<input>` cru passaram a consumir o mesmo helper em
vez de repetir classes à mão:

```ts
protected readonly fieldClass = `${controlClasses("light", false)} min-h-11`;
protected fieldWith(extra: string): string { return `${this.fieldClass} ${extra}`; }
```

Atingiu 8 campos: `revenue-goal-form` (meta anual + 12 mensais), `infra-expense-manager`
(valor + mês), `coupon-manager` (código, desconto, duração) e `plan-selector` (cupom).

**Decisões do fix:**

- **Reusar `controlClasses()` em vez de duplicar as utilitárias no template.** É a fonte
  única da geometria dos campos; repetir `rounded-xl px-3 py-2` criaria um segundo lugar
  para manter.
- **Os campos continuam `<input>` crus, não `app-text-field`.** O field atômico não cobre
  `type="month"` nem o par input+botão do cupom, e envolvê-lo para isso seria mais código
  do que reusar o helper de classes.
- **`min-h-11` (44px) somado ao helper.** `px-3 py-2` dá ~40px; a Task 39 prometeu alvos de
  toque de 44px. Só os campos desta spec ganharam o mínimo — mexer no helper mudaria todos
  os formulários do produto, fora do escopo de um fix.
- **`fieldWith(extra)` no lugar de `class` estático + `[class]` no mesmo elemento.** O
  Angular até mescla os dois, mas uma expressão só deixa explícito o que chega ao elemento.
- **`color-scheme` no `<input type="month">`.** O seletor de mês é desenhado pelo navegador:
  no tema escuro o ícone de calendário saía preto sobre superfície escura e sumia. A
  propriedade é amarrada ao `data-theme`, escopada ao componente.

Commit: `fix: inputs do painel financeiro herdam a geometria do design system de formulario`

### Fix 2 — Faturamento do manager é o lucro do negócio, não valor-hora (BE + FE)

**Sintoma.** O faturamento exibido para a gerente era calculado como
`alunos ativos × carga semanal × valor-hora` — a mesma projeção da professora. Isso
contradiz a regra que a própria spec 012 já encodava no RF11: **a gerente não recebe
valor-hora**, ela fica com o lucro do negócio.

**Correção.** Para `role === 'manager'`, o faturamento passa a ser o resultado do mês:

```
lucro = receita das assinaturas ativas
      − custo com professoras (sem as horas da gerente)
      − custo de infraestrutura vigente no mês
```

É exatamente a conta que o `ManagerFinanceService.getMonthlyOverview` já fazia para o painel
— o faturamento agora **lê dela**, em vez de manter uma segunda definição de "quanto a
gerente ganha".

**Decisões do fix:**

- **`finance.controller.ts` e `teacher-earnings.service.ts` foram movidos de `src/billing/`
  para `src/finance/`.** Sem isso, `TeacherEarningsService` (em `BillingModule`) precisaria
  de `ManagerFinanceService` (em `ManagerFinanceModule`, que já importa `BillingModule`) —
  um ciclo, resolvível só com `forwardRef`. Com o módulo de `/finance` inteiro num lugar só,
  a dependência é direta e o ciclo desaparece. O recorte de audiência continua onde estava:
  cada rota mantém o seu `@Roles`, e `/finance/teacher/*` segue separado de
  `/finance/manager/*`. `BillingModule` continua dono de `/billing` (settings, fechamento,
  pagamento).
- **A resposta ganhou o discriminador `kind: 'teacher' | 'manager'`,** em vez de dois
  endpoints. Quem pergunta é sempre "quanto eu ganho"; qual conta responde isso é regra de
  negócio, e o cliente não deveria precisar saber dela para escolher a URL.
- **A resposta do manager carrega o detalhamento** (`revenue`, `teacherExpenses`,
  `infraExpenses`, `activeStudents`) além do total. Um número de lucro sem a conta que o
  gerou é um veredito sem justificativa — o mesmo princípio do card da professora.
- **`weekly` não existe na resposta do manager.** Lucro é apuração mensal; dividir por 4,33
  produziria um número que não corresponde a nada.
- **`/financeiro` deixou de mostrar o card de faturamento para a gerente.** O
  `revenue-overview-card` já exibe exatamente esse lucro, com meta e alunos pagantes. Dois
  cards com o mesmo número, um deles antes errado, era a origem da confusão; o card da
  professora continua para quem é professora.
