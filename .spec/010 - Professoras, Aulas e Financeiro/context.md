# Spec 010 — Professoras, Aulas e Financeiro

> **Objetivo:** transformar o sistema de "uma professora + alunos" em uma **operação com corpo
> docente**: a **gerente** cadastra professoras, designa alunos e carga de aulas a cada uma, define
> a sala de Meet do aluno e o valor-hora; a **professora** tem agenda (semanal **e mensal**), entra
> na aula, responde pela presença e registra a evolução do aluno; o **aluno** entra na aula por um
> botão (sem ver o link), avalia a aula em estrelas e tem reposição automática quando falta. Tudo
> isso desemboca num **painel financeiro** onde a gerente acompanha quanto deve a cada professora.

- **Repositórios:** `barbarafarias-api` (NestJS + Firestore) e `fariasbarbara` (Angular 20).
- **Data de abertura:** 2026-07-27 · **Decisões P1–P12 e Q1–Q6 fechadas em:** 2026-07-27
  (spec fechada — pronta para virar `tasks.md`)
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas a partir da **`dev`** de cada repo,
  1 commit por task, push por fase, **1 PR por repo** na branch de release **contra a `dev`**.
- **Serviços externos novos:** **Resend** (e-mail transacional, nesta spec) e **AbacatePay**
  (gateway de PIX para pagar professoras — **preparado**, não implementado).

---

## 1. Ponto de partida (o que já existe no código)

| Peça | Estado hoje | Impacto desta spec |
|------|-------------|--------------------|
| Papéis | `types/role.ts` → `ROLES = { TEACHER, STUDENT }`; `User.isTeacher: boolean` decide o role no `UserService.createUser` | Ganha `MANAGER`; `isTeacher` → `role` com migração assistida (§2.1) |
| Usuários | Coleção `users`, entidade única para aluno e professora (`fullName, phone, email, isPaying, level, objective, prognosis`) | Ganha campos de professora (PIX, CPF, CNPJ, valor-hora, telefone visível) e, no aluno, o vínculo com a professora + sala de Meet |
| Filtro por papel | `GET /users?role=student` filtra por `isTeacher` no Firestore (spec 007) | Passa a filtrar por `role` (3 valores), com fallback retrocompatível |
| Agenda | Coleção `agenda`, docId `${dayOfWeek}_${hour}`, **1 ocupante por slot global** (spec 002) | O slot passa a pertencer a **uma professora** → docId com `teacherId` |
| Turmas | Coleção `turmas` (`name`, `studentIds`), ocupa slot como alternativa ao aluno avulso | Ganha professora responsável e sala de Meet própria; vale **1 hora** no financeiro (P7) e **não gera reposição** (Q5) |
| `prognosis` do aluno | Campo usado para **alimentar o prompt de geração de material** (ver `ai-flow.md` §6) | **Intocado.** Feedback de evolução é outra coisa e vai para coleção própria (Q2) |
| Aulas | **Não existem como registro.** A agenda é só uma grade recorrente | **Nova coleção `lessons`** — peça central da spec |
| Notificações | **Não existem** | Novo módulo `notifications` (Resend) + alertas no dashboard |
| Dashboards | `teacher-dashboard` (cards) e `student-panel` | `teacher-dashboard` se divide em visão da **gerente** e visão da **professora** |

> **Consequência de arquitetura mais importante:** presença, avaliação, reposição, visão mensal e
> financeiro só existem sobre **aulas datadas**. A grade semanal recorrente vira o **contrato**
> (quando a aula acontece toda semana) e as `lessons` viram os **fatos** (o que aconteceu naquele
> dia). Toda a spec gira em torno dessa separação.

---

## 2. Papéis e permissões

```ts
ROLES = { MANAGER: 'manager', TEACHER: 'teacher', STUDENT: 'student' }
```

- **Gerente (`manager`)** — a Bárbara. Faz tudo que a professora faz **e mais**: cadastra
  professoras, designa alunos, define valor-hora, sala de Meet, slots, aprova reagendamentos e vê o
  financeiro. Pode ser a professora responsável de um aluno (ver §6.9).
- **Professora (`teacher`)** — vê apenas **os próprios alunos e as próprias aulas**. Responde pela
  presença, entra no Meet, solicita reagendamento, registra feedback de evolução e escolhe se o
  telefone dela fica visível ao aluno. **Não** vê financeiro global nem dados de outras professoras.
- **Aluno (`student`)** — vê a professora responsável, os horários, o botão de entrar na aula (na
  janela permitida), avisa ausência com antecedência e avalia aulas concluídas.

**Regras de guarda (backend):**
- Gestão: `@Roles(MANAGER)`.
- Operação de aula: `@Roles(MANAGER, TEACHER)` + **escopo obrigatório** (professora só opera aula
  cujo `teacherId === req.user.sub`; gerente opera qualquer uma).
- Aluno: `AuthGuard` + escopo `studentId === req.user.sub`.
- **Dados sensíveis (CPF, CNPJ, chave PIX, valor-hora) só trafegam para `MANAGER`** — o DTO público
  da professora entrega apenas `{ id, fullName, phone? }` (telefone só se `phoneVisibleToStudent`).

### 2.1 Migração de `isTeacher` → `role` (P1)

Decisão: **migrar de verdade**, com dois caminhos complementares.

> ⚠️ **Achado na execução (2026-07-27):** o papel que ia no JWT morava na coleção
> **`credentials`**, não em `users` — que sequer tinha o campo. Isso criava duas fontes para o
> mesmo dado e foi o que travou o primeiro login como gerente.
>
> ✅ **Resolvido (2026-07-27):** o papel foi **centralizado em `users.role`**, que é o campo que
> todas as consultas do servidor já precisavam usar (o Firestore não faz join). O login passa a
> lê-lo de lá — uma leitura a mais por login, não por requisição. `credentials` fica com e-mail e
> hash; seu `role` permanece só como **ponte de transição** (evita travar quem ainda não migrou e
> mantém o rollback seguro) e sai depois.
>
> Precedência: `users.role` → `credentials.role` → `isTeacher` → `student`.

1. **A gerente troca o próprio registro à mão no Firebase**: `users/{id}.role = 'manager'`.
   Um documento só; o resto da base é resolvido pela ação do passo 2.
2. Para o resto da base, o painel da gerente ganha uma **ação "Corrigir papéis dos usuários"
   (1 clique)** que roda a migração no servidor: para todo `user` sem `role`, grava
   `role = isTeacher ? 'teacher' : 'student'` em `users` **e sincroniza `credentials/{id}.role`**.
   Idempotente (só toca quem está fora de sincronia), com relatório do que foi atualizado. A mesma
   ação migra os docIds da agenda (§5.4).
3. **Leitura tolerante durante a transição:** onde o código lê o papel, usa
   `user.role ?? (user.isTeacher ? 'teacher' : 'student')`. `isTeacher` para de ser escrito e é
   removido numa spec futura.
4. O JWT passa a carregar o novo `role`; **tokens já emitidos ficam com o valor antigo** → a gerente
   precisa deslogar/logar depois da migração (avisar na tela da ação).

---

## 3. Requisitos Funcionais (RF)

### 3.1 Gerente — cadastro e gestão de professoras
- **RF1** — Cadastrar professora com: **nome, e-mail, senha (credenciais de login), telefone,
  chave PIX, CPF, CNPJ (opcional)**; `createdAt` (data de cadastro) gravada pelo servidor.
- **RF2** — Editar e **desativar** professora (P4: não se exclui — desativa).
- **RF3** — Listar professoras com resumo: nº de alunos, aulas na semana, valor-hora vigente,
  média de avaliação.
- **RF4** — Ação de manutenção **"Corrigir papéis dos usuários"** (§2.1).

### 3.2 Gerente — designação de alunos e salas
- **RF5** — Designar um **aluno a uma professora responsável** (1 por aluno) com a cadência padrão
  de **1 aula por semana** (≈ 4 h/mês — P3).
- **RF6** — Definir o **slot regular** do aluno na agenda daquela professora (dia da semana + hora,
  1 h de duração).
- **RF7** — Definir o **slot de reposição pré-combinado** do aluno (dia da semana + hora): destino
  automático quando o aluno perde a aula.
- **RF8** — Cadastrar a **sala de Meet do aluno** (ou da turma) — uma sala por aluno/turma (P10),
  que acompanha o aluno mesmo se ele trocar de professora.
- **RF9** — Trocar o aluno de professora preservando o histórico (aulas passadas continuam
  apontando para quem as deu).
- **RF10** — Ao desativar uma professora, seus alunos ficam **"pendentes de professora"** e são
  **destacados com urgência no dashboard** para realocação (P4).

### 3.3 Gerente — dashboard do dia e alertas
- **RF11** — Painel **"Aulas de hoje"** com **nome do aluno + professora responsável** e horário. Se
  a responsável for a própria gerente, o nome dela aparece normalmente.
- **RF12** — Cada item mostra o estado da aula: agendada / em andamento / concluída / aluno faltou /
  aluno avisou / professora ausente / reagendada.
- **RF13** — **Alertas** no dashboard: solicitações de reagendamento **aguardando aprovação** (com
  a justificativa à vista), alunos **pendentes de professora**, reposições empurradas por conflito,
  ausências avisadas pelo aluno.
- **RF14** — **Aprovar ou recusar** a solicitação de reagendamento da professora, lendo o **motivo
  classificado** e a descrição (§6.6).

### 3.4 Gerente — painel financeiro
- **RF15** — Definir um **valor-hora global** (base atual: **R$ 60,00/h** — mensalidade de R$ 240
  para ~4 aulas/mês).
- **RF16** — Definir um **valor-hora customizado por professora**, que sobrepõe o global.
- **RF17** — Ver, por professora e por período (mês corrente por padrão): aulas faturáveis,
  valor-hora aplicado, **total a pagar** e a **chave PIX**.
- **RF18** — Detalhar o total: lista das aulas que o compõem (data, aluno/turma, valor, motivo).
- **RF19** — Alterar o valor-hora **não** altera aulas já fechadas (cada aula guarda `rateApplied`).
- **RF20** — Pagamento é **PIX manual** por enquanto; o modelo já nasce preparado para disparo via
  **AbacatePay** (P12, §7.5).

### 3.5 Professora — agenda, aula e acompanhamento
- **RF21** — Ver a **agenda semanal** (grade Dom–Sáb × horas) apenas com os próprios alunos.
- **RF22** — Ver a **agenda mensal**: calendário do mês com as aulas de cada dia (dia + hora +
  aluno), navegável entre meses.
- **RF23** — Abrir o detalhe de uma aula: aluno, horário, botão do Meet, presença, reagendamento.
- **RF24** — **Entrar na sala de Meet** pelo botão (nova aba) — esse clique é o **gatilho primário
  de presença dela** (§6.4).
- **RF25** — Marcar presença/falta do aluno manualmente (**gatilho secundário**, até **72 h** após).
- **RF26** — **Solicitar reagendamento planejado** com **≥ 4 h de antecedência**, informando nova
  data/hora e **motivo classificado** (`saúde` · `imprevisto` · `pessoal` · `outro` + descrição
  obrigatória quando "outro") → aprovação da gerente (§6.6).
- **RF27** — Quando ela **não comparece** e não solicitou nada, receber do sistema uma **remarcação
  sugerida** que ela precisa **confirmar com justificativa obrigatória** (mesmos motivos), seguindo
  para o mesmo fluxo de aprovação da gerente (§6.7).
- **RF28** — Acompanhar as próprias solicitações e a decisão da gerente (aprovada/recusada + nota).
- **RF29** — Alternar a visibilidade do **próprio telefone para os alunos**.
- **RF30** — Ver as **avaliações e comentários** que recebeu, identificados por aluno (P9).
- **RF31** — Registrar **feedback de evolução do aluno** (Q2): entrada datada, opcionalmente ligada
  a uma aula, com texto livre e nível percebido. Histórico por aluno, em ordem cronológica.
- **RF32** — Ver, em destaque, alunos **pendentes/recém-atribuídos** a ela.

### 3.6 Aluno — aula e avaliação
- **RF33** — Ver o **nome da professora responsável** no painel (e o telefone, se ela permitiu).
- **RF34** — Ver os próprios horários (semana e mês), incluindo aulas de reposição.
- **RF35** — Botão **"Entrar na aula"** que aparece **10 min antes** do horário e some **20 min
  depois**; abre o Meet em nova aba. **O aluno nunca vê a URL** — só o botão. O clique é o
  **gatilho primário de presença dele**.
- **RF36** — Se tentar entrar **a partir de 15 min** após o horário, o sistema informa que **a aula
  foi perdida** e ela é **reagendada automaticamente** para o slot de reposição.
- **RF37** — **Avisar ausência com antecedência** de **no mínimo 4 h** (Q4): a aula é liberada,
  professora responsável e gerente recebem e-mail, e a aula vai para o slot de reposição.
- **RF38** — **Avaliar a aula concluída**: 1 a 5 estrelas + comentário opcional. Uma por aula.
- **RF39** — Ser avisado (dashboard + e-mail) quando uma aula for reagendada, por qualquer motivo.

### 3.7 Notificações (Resend)
- **RF40** — Disparo de **e-mail transacional via Resend** no momento do evento:
  | Evento | Destinatários |
  |--------|---------------|
  | Professora solicita reagendamento (planejado ou pós-ausência) | gerente |
  | Gerente aprova / recusa o reagendamento | professora + aluno |
  | Aluno perdeu a aula → reposição criada | aluno + gerente |
  | **Aluno avisou ausência com antecedência (RF37)** | professora responsável + gerente |
  | Reposição empurrada por conflito de slot (P6) | aluno + gerente |
  | Aluno ficou pendente de professora | gerente |
- **RF41** — Todo evento que gera e-mail gera também o **alerta correspondente no dashboard** — o
  e-mail é conveniência, o dashboard é a fonte da verdade.

---

## 4. Requisitos Não-Funcionais (RNF)

- **RNF1** — Arquitetura existente: BE `module → controller → service → repository → entity`;
  FE **smart pages / dumb components**, mobile-first (padrão das specs 001/003/007).
- **RNF2** — **Autoridade do relógio é o servidor.** Janela de entrada, "perdeu a aula", limites de
  4 h (professora e aluno) e prazo de 72 h são decididos no backend. Fuso **America/Sao_Paulo**.
- **RNF3** — **O link do Meet não vai no HTML do aluno.** É devolvido por endpoint só quando a
  janela está aberta; o botão faz `window.open(url, '_blank')` com a URL recém-recebida.
- **RNF4** — CPF, CNPJ, PIX e valor-hora nunca aparecem em resposta destinada a aluno ou a outra
  professora (DTOs distintos por papel).
- **RNF5** — Escopo por dono em todo endpoint de aula (professora ≠ dona → 403).
- **RNF6** — Materialização de aulas **idempotente**: docId determinístico, reexecutar não duplica.
- **RNF7** — **Falha de e-mail não derruba a operação**: o envio via Resend é isolado; se falhar,
  loga e a ação de negócio (reagendar, aprovar, avisar ausência) permanece válida.
- **RNF8** — **Resend pelo SDK, com a API key como única variável obrigatória** (Q3 revisado na
  execução): `RESEND_API_KEY`. Sem `RESEND_FROM`, o SDK usa o remetente compartilhado da Resend
  (`onboarding@resend.dev`) e o envio já funciona — com a limitação de entregar **apenas ao e-mail
  dono da conta**. `RESEND_FROM` é **opcional**: entra quando o domínio próprio
  (`barbarafarias.com.br`, spec 009) estiver verificado com SPF/DKIM, e é só variável de
  ambiente — nada de código muda.
- **RNF8.1** — O backend passa a ter um **`.env.example` versionado** com **todas as variáveis
  obrigatórias** e valores de exemplo (nunca valores reais). Hoje ele não existe.
  > ✅ **Verificado na execução (2026-07-27):** ao contrário do que o `ai-flow.md` §12 registra, o
  > `.env` **não está** versionado — está no `.gitignore` (linha 39) e **nunca** apareceu no
  > histórico (`git log --all -- .env` vazio). As chaves não vazaram pelo repositório, então a
  > rotação deixa de ser urgente (vira higiene opcional).

  Conteúdo mínimo:

  ```dotenv
  # Firebase (Admin SDK) — service account em base64
  FIREBASE_SERVICE_ACCOUNT_BASE=
  # Autenticação
  JWT_SECRET=
  # Servidor
  PORT=8080
  CORS_ORIGINS=http://localhost:4200,https://barbarafarias.com.br
  # Geração de material (Gemini)
  GEMINI_API_KEY=
  GEMINI_MODEL=gemini-flash-latest
  # E-mail transacional (Resend) — novo nesta spec
  RESEND_API_KEY=
  RESEND_FROM="Bárbara Farias <no-reply@barbarafarias.com.br>"
  ```
- **RNF9** — Reuso do design system (modal, frame, botões, ícones) — nada de componente paralelo.
- **RNF10** — Build verde (BE `nest build` + testes; FE `ng build`) ao fim de cada fase.

---

## 5. Modelo de dados

### 5.1 `users` — professora (`manager` / `teacher`)

```
role: 'manager' | 'teacher' | 'student'
createdAt: Timestamp            // data de cadastro
pixKey?: string
cpf?: string
cnpj?: string                   // opcional
hourlyRate?: number             // override do valor-hora global (RF16)
phoneVisibleToStudent: boolean  // default: false
active: boolean                 // desativação em vez de exclusão (P4)
```

> **`meetUrl` NÃO fica aqui** — a sala é do aluno/turma (P10).

### 5.2 `users` — aluno

```
role: 'student'
teacherId?: string              // professora responsável (1 por aluno — P11)
teacherName?: string            // denormalizado (padrão já usado em agenda/turmas)
pendingTeacher?: boolean        // true quando a professora foi desativada (RF10)
lessonsPerWeek: number          // 1 (padrão — P3)
meetUrl?: string                // sala fixa do aluno, cadastrada pela gerente (RF8)
makeupSlot?: { dayOfWeek: 0..6, hour: number }   // slot de reposição pré-combinado (RF7)
```

`objective` / `prognosis` seguem **exclusivamente** a serviço do prompt de geração de material
(`ai-flow.md` §6) — feedback pedagógico vai para §5.9.

### 5.3 `turmas`

```
+ teacherId, teacherName        // professora responsável
+ meetUrl                       // sala fixa da turma (P10)
```
No financeiro, a aula de turma vale **1 hora**, independentemente do nº de alunos (P7). **Falta de
aluno em turma não gera reposição** (Q5) — a aula acontece para o grupo; o acompanhamento
individual é o que a professora faz nas particulares.

### 5.4 `agenda` — grade recorrente por professora

Slot deixa de ser global: **docId passa de `${dayOfWeek}_${hour}` para
`${teacherId}_${dayOfWeek}_${hour}`**, e a entidade ganha `teacherId` / `teacherName`.
Continua valendo **1 ocupante por slot da professora** (aluno avulso ou turma) — sem double-booking
por professora; duas professoras podem ter alunos no mesmo dia/hora.

> **Migração:** os slots existentes são reescritos com o `teacherId` da gerente, junto da ação de
> 1 clique do §2.1.

### 5.5 `lessons` — aula datada (**nova**)

```
id
teacherId, teacherName
studentId, studentName          // ou turmaId, turmaName
date: 'YYYY-MM-DD'
hour: number                    // 8..20, duração fixa de 60 min
startAt: Timestamp
origin: 'regular' | 'makeup' | 'rescheduled'
status: 'scheduled' | 'completed' | 'student_no_show' | 'student_cancelled'
      | 'teacher_absence' | 'cancelled'
rescheduledFromId?, rescheduledToId?
studentJoinedAt?, teacherJoinedAt?          // gatilho primário de presença
attendance?: { present: boolean, markedBy: string, markedAt: Timestamp, source: 'auto' | 'manual' }
rating?: { stars: 1..5, comment?: string, ratedAt: Timestamp }
rateApplied?: number            // congelado no fechamento (RF19)
payable: boolean                // derivado do status (§6.8)
```

**docId determinístico:** `${teacherId}_${studentId}_${date}_${hour}` — idempotência da
materialização (RNF6) e nada de aula duplicada no mesmo slot.

**Como as aulas nascem:** `ensureLessons(from, to)` idempotente, a partir da grade recorrente,
chamado quando alguém abre a semana/mês ou o dashboard do dia — **sem depender de cron** (deploy
Vercel/Nest, sem scheduler garantido). Reposições nascem dos eventos de falta.

### 5.6 `reschedule_requests` — solicitação da professora (**nova**)

```
id, lessonId, teacherId, teacherName, studentId, studentName
kind: 'planned' | 'no_show'            // ≥4h de antecedência  |  confirmação pós-ausência (Q1)
originalStartAt: Timestamp
proposedDate: 'YYYY-MM-DD', proposedHour: number   // sugerido pelo sistema quando kind='no_show'
reasonType: 'saude' | 'imprevisto' | 'pessoal' | 'outro'
reasonText?: string                    // obrigatório quando reasonType='outro'
status: 'pending' | 'approved' | 'rejected'
requestedAt, decidedAt?, decidedBy?, decisionNote?
```

Os dois `kind` percorrem **o mesmo fluxo de aprovação** e a gerente vê a justificativa em ambos.

### 5.7 `settings/billing`

```
{ defaultHourlyRate: 60, currency: 'BRL', updatedAt, updatedBy }
```
Valor-hora vigente = `teacher.hourlyRate ?? settings.defaultHourlyRate`.

### 5.8 `student_feedbacks` — evolução do aluno (**nova**, Q2)

```
id
studentId, studentName
teacherId, teacherName
lessonId?                       // opcional: feedback amarrado a uma aula
date: 'YYYY-MM-DD'
perceivedLevel?: 'A1' | 'A2' | 'B1' | 'B2'
text: string                    // observação da professora
createdAt
```

Coleção **separada** de `prognosis` de propósito: `prognosis` é insumo de prompt de IA, este é
registro pedagógico humano. **Visibilidade: professora responsável + gerente** (não exposto ao
aluno) — para a professora escrever sem filtro.

### 5.9 Tipos no frontend (`src/app/models/`)

`teacher.model.ts` deixa de ser `Omit<User, ...>` e ganha modelo próprio (§5.1); novos
`lesson.model.ts` (aula, status, janela de acesso, avaliação), `reschedule.model.ts`,
`feedback.model.ts` e `billing.model.ts`.

---

## 6. Regras de negócio

### 6.1 Contrato pedagógico e financeiro (P2/P3)
**1 aula por semana, 1 hora cada, ≈ 4 h/mês.** O aluno paga mensalidade (**R$ 240**) e a professora
recebe **por hora efetivamente sob a responsabilidade dela** (base **R$ 60/h**). As aulas
particulares de cada aluno são responsabilidade da professora alocada.

### 6.2 Janela de entrada na aula (RF35/RF36)

Com `T` = início da aula, tudo avaliado **no servidor**:

| Momento | Botão do aluno | Efeito ao clicar |
|---------|----------------|------------------|
| antes de `T-10min` | oculto | — |
| `T-10min` … `T+15min` | **"Entrar na aula"** | devolve a URL do Meet, grava `studentJoinedAt` |
| `T+15min` … `T+20min` | **"Aula perdida"** | informa a perda e dispara a reposição (§6.5) |
| depois de `T+20min` | oculto | aula fecha como `student_no_show` |

A professora entra pela mesma sala a partir de `T-10min` (aguarda o aluno); a entrada dela não tem
limite superior enquanto a aula não fechar.

### 6.3 Aviso prévio de ausência do aluno (RF37/Q4)
Até **4 h antes** de `T`, o aluno pode avisar que não vai. A aula vira `student_cancelled`,
professora e gerente recebem e-mail, e a reposição vai para o slot pré-combinado (§6.5). Depois das
4 h, o botão some — a partir daí só existe a falta (§6.2).

### 6.4 Presença (P5)
- **Gatilho primário (automático):** o clique em "Entrar na aula" **no painel do aluno e no da
  professora**. Aluno entrou dentro da janela → presente.
- **Gatilho secundário (manual):** a professora marca presença/falta em até **72 h** após a aula.
  Prevalece sobre o automático (é correção humana).
- **Sem marcação manual em 72 h:** o sistema fecha pelos gatilhos primários
  (`studentJoinedAt` presente → `completed`; ausente → `student_no_show`) e grava
  `attendance.source: 'auto'`.

### 6.5 Reposição por falta/ausência do aluno (RF36/RF37/P6)
`nextDate` = próxima ocorrência de `makeupSlot.dayOfWeek` após a data perdida, no
`makeupSlot.hour`; cria `lesson` com `origin: 'makeup'`, ligada por
`rescheduledFromId`/`rescheduledToId`. **Slot ocupado → empurra para a semana seguinte E avisa
aluno e gerente** (dashboard + e-mail). Sem `makeupSlot` cadastrado → não reagenda e alerta a
gerente (a UI deve tornar o campo obrigatório no RF7). **Aula de turma não entra aqui** (Q5).

### 6.6 Reagendamento planejado da professora (RF26/P2)
1. Solicita com **≥ 4 h de antecedência** (o backend recusa fora do limite), com nova data/hora e
   **motivo classificado** (`saúde` · `imprevisto` · `pessoal` · `outro` + texto obrigatório).
2. Cria `reschedule_request` `kind: 'planned'`, `status: 'pending'`; a aula original segue
   `scheduled` até a decisão.
3. Gerente notificada na hora: alerta no dashboard (RF13) **+ e-mail** (RF40).
4. **Aprovada:** aula original vira `teacher_absence` (**não faturável**) e nasce a aula
   `origin: 'rescheduled'` na data proposta (faturável quando ocorrer). Aluno e professora avisados.
5. **Recusada:** a aula original permanece; professora e aluno são avisados com a nota da decisão.
6. A data proposta é validada contra a agenda da professora (slot livre) antes de aprovar.

### 6.7 Ausência não avisada da professora (RF27/Q1)
Aula em que a **professora não entrou** e que não teve solicitação prévia:
1. A aula é fechada como `teacher_absence` — **não paga**.
2. O sistema **sugere uma remarcação** (próxima ocorrência livre do mesmo slot com aquele aluno).
3. A professora precisa **confirmar a sugestão com justificativa obrigatória** (mesmos motivos
   classificados) — sem isso a remarcação não segue.
4. A confirmação vira `reschedule_request` `kind: 'no_show'` e entra **na mesma fila de aprovação**
   da gerente, que lê a justificativa antes de decidir (§6.6 passos 3–6).

### 6.8 Faturamento (`payable`)

| Situação | Paga? | Razão |
|----------|-------|-------|
| `completed` | **sim** | aula dada |
| `student_no_show` (faltou sem avisar) | **sim** | a professora esteve disponível; o aluno perde a aula do mês e a reposição cai na mensalidade seguinte — sem prejuízo de caixa (P2) |
| aula de reposição (`makeup`), quando ocorrer | **sim** | é aula nova, coberta pela mensalidade do mês em que acontece |
| `student_cancelled` (avisou ≥4 h) | **sim** | o contrato é com a professora, do mesmo jeito que o aluno paga o mês inteiro tendo assistido ou não às aulas (Q6) |
| `teacher_absence` (planejada ou não avisada) | **não** | a aula não foi dada; a professora recebe pela remarcada |
| `cancelled` | **não** | — |

**Princípio único:** a professora é paga por **hora contratada sob a responsabilidade dela** — o que
só deixa de valer quando **ela** não entrega a aula (`teacher_absence`, `cancelled`). Qualquer
comportamento do aluno (faltar, avisar, remarcar) não reduz o que ela recebe, espelhando a
mensalidade que o aluno paga independentemente de assistir a todas as aulas.

`rateApplied` é congelado no fechamento; mudar o valor-hora depois não mexe no passado.

### 6.9 Gerente como professora responsável (P8)
As aulas dela aparecem normalmente na operação (dashboard, agenda, presença), mas **não entram no
painel financeiro como despesa**. Se houver totalização dela, é apenas informativa e separada.

---

## 7. Contrato de API

### 7.1 Professoras e gestão — `@Roles(MANAGER)`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/teachers` | Lista com resumo (alunos, aulas/semana, valor-hora, média) |
| POST | `/teachers` | Cadastra professora + credenciais |
| GET | `/teachers/:id` | Detalhe completo (dados sensíveis) |
| PUT | `/teachers/:id` | Atualiza (inclui `hourlyRate`) |
| PATCH | `/teachers/:id/active` | Desativa/reativa (dispara `pendingTeacher` nos alunos) |
| PUT | `/teachers/:id/students` | Designa alunos (`teacherId`, `lessonsPerWeek`) |
| POST | `/admin/migrate-roles` | Ação de 1 clique do §2.1 (idempotente, com relatório) |

### 7.2 Professora (própria) — `@Roles(MANAGER, TEACHER)`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/teachers/me` | Perfil próprio + alunos |
| PATCH | `/teachers/me/phone-visibility` | Liga/desliga telefone visível (RF29) |
| GET | `/teachers/me/ratings` | Avaliações recebidas (RF30) |

### 7.3 Aulas
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/lessons?from=&to=&teacherId=` | MANAGER, TEACHER | Aulas do período (semana/mês) |
| GET | `/lessons/day?date=` | MANAGER | Aulas do dia (RF11) |
| GET | `/lessons/student/:id?from=&to=` | AUTH (dono) | Aulas do aluno |
| GET | `/lessons/:id/access` | AUTH (dono) | Janela: `{ state: 'closed'\|'open'\|'missed', meetUrl? }` + grava o gatilho de presença |
| POST | `/lessons/:id/attendance` | MANAGER, TEACHER (dona) | Presença manual, ≤ 72 h (RF25) |
| POST | `/lessons/:id/student-cancel` | AUTH (aluno dono) | Aviso de ausência, ≥ 4 h (RF37) |
| POST | `/lessons/:id/rating` | AUTH (aluno dono) | Avaliação (RF38) |

### 7.4 Reagendamento
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/lessons/:id/reschedule-suggestion` | TEACHER (dona) | Sugestão do sistema após ausência (RF27) |
| POST | `/lessons/:id/reschedule-requests` | TEACHER (dona) | Cria solicitação (`kind`, motivo classificado; valida as 4 h quando `planned`) |
| GET | `/reschedule-requests?status=pending` | MANAGER | Fila de aprovação com justificativas (RF13/RF14) |
| GET | `/reschedule-requests/mine` | TEACHER | Acompanhamento das próprias (RF28) |
| POST | `/reschedule-requests/:id/approve` | MANAGER | Aprova e recria a aula |
| POST | `/reschedule-requests/:id/reject` | MANAGER | Recusa com nota |

### 7.5 Financeiro — `@Roles(MANAGER)`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/PUT | `/billing/settings` | Valor-hora global (RF15) |
| GET | `/billing/summary?month=YYYY-MM` | Total por professora (RF17) |
| GET | `/billing/summary/:teacherId?month=` | Detalhe aula a aula (RF18) |

> **Preparação para a AbacatePay (P12):** o pagamento nasce como **porta**
> (`PayoutProvider.createPixPayout(teacher, amount, ref)`) com implementação `ManualPixProvider`
> (só registra "pago manualmente"). Trocar por `AbacatePayProvider` depois não deve tocar em
> controller nem em regra de negócio.

### 7.6 Feedback de evolução — `@Roles(MANAGER, TEACHER)`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/students/:id/feedbacks` | Histórico cronológico (professora responsável ou gerente) |
| POST | `/students/:id/feedbacks` | Registra entrada (RF31) |

### 7.7 Rotas existentes afetadas
- `GET /users?role=` passa a aceitar `manager|teacher|student` (fallback por `isTeacher`).
- `GET|POST|DELETE /agenda*` ganham escopo por `teacherId`.

### 7.8 Notificações (interno)
`NotificationsModule` com `ResendService` (SDK `resend`), templates por evento (RF40), lendo
`RESEND_API_KEY` e `RESEND_FROM` via `ConfigService` (padrão já usado no `GeminiService`).
Chamado pelos serviços de aula/reagendamento/alocação; **nunca** bloqueia a transação (RNF7).

---

## 8. Telas (frontend)

**Gerente**
- `/teachers` — lista + modal de cadastro/edição (dados, PIX, CPF/CNPJ, valor-hora), desativar.
- `/teachers/:id` — alunos designados, slot regular, slot de reposição, sala de Meet do aluno.
- `/financeiro` — valor-hora global, cards por professora (aulas, total, PIX), detalhe por aula.
- Dashboard — **"Aulas de hoje"** (aluno + professora + status) e **alertas**: reagendamentos
  pendentes (com motivo e justificativa), alunos pendentes de professora, reposições empurradas,
  ausências avisadas.
- Configurações — botão **"Corrigir papéis dos usuários"** (§2.1).

**Professora**
- `/agenda` — grade semanal só com os alunos dela + **alternador Semana / Mês** (calendário novo).
- Detalhe da aula (modal): aluno, hora, **botão Meet**, presença manual (≤72 h), **solicitar
  reagendamento** (bloqueado a menos de 4 h) e, quando houver ausência, o card de **remarcação
  sugerida** exigindo motivo + justificativa.
- Perfil — toggle "meu telefone visível" + avaliações recebidas + minhas solicitações.
- Aluno — histórico de **feedback de evolução** (ler e registrar).
- Destaque de alunos pendentes/recém-atribuídos.

**Aluno**
- `student-panel` — card da professora responsável (nome + telefone se visível), horários da semana
  e do mês, **botão "Entrar na aula"** dentro da janela, **"não poderei comparecer"** (até 4 h
  antes), aviso de aula reagendada e card de **avaliação** (estrelas + comentário).

---


## 10. Riscos e pontos de atenção

- **Alcance do remetente compartilhado da Resend (Q3/RNF8):** só com a `RESEND_API_KEY` o envio
  funciona, mas a Resend entrega **apenas ao e-mail dono da conta** — ótimo para validar o fluxo,
  insuficiente para avisar professoras e alunos. Verificar `barbarafarias.com.br` (SPF/DKIM no DNS)
  e definir `RESEND_FROM` libera qualquer destinatário; é passo de painel/DNS, sem código.
- **Migração de papéis** mexe em `auth` (role no JWT), `teacherGuard` do FE e no filtro da spec 007;
  tokens antigos exigem novo login (avisar na UI da ação).
- **Agenda com docId novo** invalida os slots atuais — a migração precisa cobrir isso junto.
- **Duplicidade de fonte da verdade** (grade recorrente × aulas materializadas): alterar a grade
  **não** reescreve aulas passadas; definir se reescreve as futuras já materializadas.
- **Fuso horário**: cálculo em UTC puro erra as janelas de 10/15/20 min e os limites de 4 h e 72 h.
- **Detecção de ausência da professora** depende de `teacherJoinedAt`: se ela dá a aula por outro
  caminho (link direto, celular), o sistema a marca como ausente injustamente — o card de remarcação
  sugerida (§6.7) precisa oferecer "eu dei esta aula" como saída, com confirmação da gerente.
- **Chaves de API**: `RESEND_API_KEY` fora do repositório — o `.env` já está no `.gitignore` e
  nunca foi versionado; o `.env.example` documenta os nomes, sem valores.
- **Índice composto no Firestore** (`teacherId` + `date`) para a consulta mensal.
- **E-mail é canal externo**: rate limit/bounce não pode travar aprovação de reagendamento (RNF7).

---

## 11. Decisões confirmadas (2026-07-27)

| # | Decisão |
|---|---------|
| P1 | Migrar `isTeacher` → `role`; gerente troca o próprio doc à mão, resto via **ação de 1 clique**; leitura tolerante na transição |
| P2 | Falta do **aluno**: professora **recebe** (reposição também, na mensalidade seguinte). Falta da **professora**: reagendamento com **≥4 h e aprovação da gerente**; aula não dada **não é paga** |
| P3 | **1 aula/semana por aluno**, ~4 h particulares/mês, sob responsabilidade da professora alocada |
| P4 | Professora desativada → alunos **pendentes de professora**, destacados com urgência no dashboard |
| P5 | Presença: **primário** = clique em "Entrar na aula" (aluno e professora); **secundário** = marcação manual em até **72 h**; sem marcação, valem os primários |
| P6 | Slot de reposição ocupado → **empurra para a semana seguinte e avisa aluno + gerente** |
| P7 | Turma conta **por hora** (base do pagamento é a hora), não por aluno |
| P8 | Gerente como responsável: **apenas controle**, não entra no financeiro como despesa |
| P9 | Professora **vê** as avaliações e comentários, identificados |
| P10 | Sala de Meet é **por aluno/turma**, não por professora |
| P11 | **1 professora por aluno** (multi-professora fica para o futuro) |
| P12 | Pagamento **PIX manual** agora; código preparado para **AbacatePay** |
| Q1 | Ausência não avisada da professora: **não paga** + **remarcação sugerida pelo sistema**, que ela confirma com **motivo classificado** (saúde/imprevisto/pessoal/outro) e segue para a **mesma fila de aprovação** da gerente |
| Q2 | Feedback de evolução entra nesta spec, em **coleção própria** (`student_feedbacks`) — `prognosis` continua dedicado ao prompt de geração de material |
| Q3 | Resend pelo SDK: **só a `RESEND_API_KEY` é obrigatória** (remetente compartilhado por padrão). `RESEND_FROM` fica opcional, para quando o domínio próprio for verificado. BE ganha **`.env.example`** com todas as variáveis |
| Q4 | Aluno pode **avisar ausência com ≥4 h**; e-mail para professora responsável e gerente; aula vai para o slot de reposição |
| Q5 | **Falta em turma não gera reposição** — o acompanhamento individual acontece nas particulares |
| Q6 | Aula **cancelada pelo aluno com aviso prévio é paga** à professora: o contrato é com ela, assim como o aluno paga o mês independentemente de assistir a todas as aulas. A professora só não recebe quando **ela** não entrega a aula |

---

## 12. Pendências externas (fora do código)

| # | Pendência | Quando |
|---|-----------|--------|
| E1 | **Gerar a `RESEND_API_KEY`** e colocar no ambiente — é o único requisito para as notificações funcionarem | para ativar os e-mails |
| E1.1 | *(depois)* Verificar `barbarafarias.com.br` na Resend (SPF/DKIM no DNS) e definir `RESEND_FROM`, para entregar a qualquer destinatário e não só ao dono da conta | quando quiser e-mail para alunos/professoras |
| E2 | Trocar `role` do usuário da gerente para `manager` no Firebase (§2.1, passo 1) | ao subir a Fase 1 |
| E3 | ~~Rotacionar as chaves commitadas no `.env`~~ — **não se aplica**: o `.env` nunca foi versionado (verificado na Fase 6). Rotação vira higiene opcional | — |
| E4 | Criar as salas de Meet fixas de cada aluno/turma para cadastro no painel (RF8) | antes da Fase 9 |

---

## 13. Progresso

| Fase | Repo | Branch | Status |
|------|------|--------|--------|
| — | — | — | Spec em elaboração |
