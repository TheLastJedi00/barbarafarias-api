# Spec 002 — Agenda

> **Objetivo:** dar ao professor um painel de **Agenda** (acessado pelo dashboard) com uma grade
> semanal onde ele aloca alunos (ou turmas) em horários fixos; e exibir, no dashboard do **aluno**,
> o(s) dia(s) da semana e horário(s) em que ele foi marcado.

- **Repositórios:** `barbarafarias-api` (NestJS + Firestore) e `fariasbarbara` (Angular 20).
- **Data de abertura:** 2026-07-04
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas a partir da `main` de **cada repo**,
  1 commit por task, push por fase, **1 PR por repo** na branch de release.

---

## 1. Interpretação & decisões confirmadas

Confirmado com o usuário (2026-07-04):

1. **Grade semanal recorrente** (não é por data específica). Um slot é identificado por
   **(dia-da-semana, hora)** e se repete toda semana. O aluno vê "Terça-feira às 15h".
2. **Colunas = 7 dias (Domingo → Sábado); linhas = horários** de **8h a 20h**, de hora em hora
   (13 linhas: 8,9,…,20). É isso que fecha as "7 colunas" do pedido original.
3. **Capacidade do slot:** cada slot comporta **um único ocupante**, que é **ou um aluno avulso ou
   uma turma** (grupo de alunos). **Nunca** dois alunos avulsos, **nunca** duas turmas no mesmo slot.
   → Introduz o conceito de **Turma** (grupo nomeado de alunos).

**Consequências de modelagem:**
- O ocupante de um slot é **polimórfico**: `student` (1 aluno) **ou** `turma` (N alunos).
- O horário de um aluno é **derivado**: ele aparece na grade se estiver alocado **diretamente**
  (avulso) **ou** se pertencer a uma **turma** que está alocada num slot.
- Como o slot tem 1 ocupante só, **não há double-booking** possível num mesmo (dia, hora).

---

## 2. Requisitos Funcionais (RF)

**Professor — Agenda**
- **RF1** — Acessar a Agenda pelo card "Agenda" do dashboard (hoje "em breve" → ativar).
- **RF2** — Ver a grade semanal: 7 colunas (Dom–Sáb) × 13 linhas (8h–20h), com o ocupante de cada slot.
- **RF3** — Clicar num slot **vazio** → escolher **um aluno** ou **uma turma** → o ocupante fica
  "cravado" naquele slot.
- **RF4** — Clicar num slot **ocupado** → ver o ocupante (nome do aluno ou da turma + alunos) e
  **liberar** o slot.
- **RF5** — Reatribuir um slot ocupado substitui o ocupante (nunca acumula dois).

**Professor — Turmas**
- **RF6** — Criar uma turma com nome e um conjunto de alunos.
- **RF7** — Editar a turma (renomear, adicionar/remover alunos) e excluí-la.
- **RF8** — Ao excluir uma turma, os slots que a referenciam são **liberados** automaticamente.

**Aluno**
- **RF9** — No dashboard do aluno, ver seus horários marcados: **dia da semana + hora**, indicando
  se é aula **individual** ou de **turma** (com o nome da turma). Pode haver mais de um.

---

## 3. Requisitos Não-Funcionais (RNF)

- **RNF1** — Seguir a arquitetura existente: BE = módulo→controller→service→repository→entity
  (padrão do módulo `video`); FE = **smart pages / dumb components** (padrão da spec 001).
- **RNF2** — Endpoints de escrita protegidos por `@Roles(ROLES.TEACHER)`; leitura do aluno protegida
  por `AuthGuard`.
- **RNF3** — TypeScript enxuto; reusar componentes do design system da spec 001 (modal, frame, button,
  back-button, ícones, animações).
- **RNF4** — Sem double-booking: unicidade do slot garantida pelo docId `${dayOfWeek}_${hour}`.
- **RNF5** — Build verde (BE `nest build` / FE `ng build`) ao fim de cada fase.

---

## 4. Modelo de dados

### 4.1 Firestore (backend)

**Coleção `turmas`** (docId = auto):
```
{ id, name: string, studentIds: string[], studentNames: string[] }
```

**Coleção `agenda`** (docId = `${dayOfWeek}_${hour}` → 1 ocupante por slot):
```
{
  dayOfWeek: 0..6,           // 0=domingo … 6=sábado
  hour: number,             // 8..20
  occupantType: 'student' | 'turma',
  studentId?: string,  studentName?: string,   // quando occupantType='student'
  turmaId?: string,    turmaName?: string       // quando occupantType='turma'
}
```
Slot vazio = documento inexistente.

### 4.2 Tipos TypeScript (frontend — `src/app/models/`)

```ts
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Dom … 6=Sáb

export interface Turma {
  id?: string;
  name: string;
  studentIds: string[];
  studentNames?: string[];
}

export interface AgendaSlot {
  dayOfWeek: DayOfWeek;
  hour: number;
  occupantType: 'student' | 'turma';
  studentId?: string;  studentName?: string;
  turmaId?: string;    turmaName?: string;
}

// Horário resolvido para exibir ao aluno
export interface StudentSchedule {
  dayOfWeek: DayOfWeek;
  hour: number;
  kind: 'individual' | 'turma';
  turmaName?: string;
}
```

Constantes de UI: `DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']`, `HOURS = [8..20]`.

---

## 5. Contrato de API (backend `barbarafarias-api`)

**Módulo `agenda`**
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/agenda` | TEACHER | Todos os slots ocupados (grade completa) |
| POST | `/agenda` | TEACHER | Atribui/atualiza slot (upsert por `${dayOfWeek}_${hour}`) |
| DELETE | `/agenda/:dayOfWeek/:hour` | TEACHER | Libera o slot |
| GET | `/agenda/student/:studentId` | AUTH | Horários resolvidos do aluno (avulso + via turmas) |

**Módulo `turmas`**
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/turmas` | TEACHER | Lista de turmas |
| POST | `/turmas` | TEACHER | Cria turma `{ name, studentIds }` |
| PUT | `/turmas/:id` | TEACHER | Atualiza turma |
| DELETE | `/turmas/:id` | TEACHER | Exclui turma + libera slots que a referenciam (RF8) |

> `GET /agenda/student/:studentId` resolve no servidor: busca alocações diretas do aluno +
> turmas que o contêm + slots dessas turmas, e devolve `StudentSchedule[]`.

---


## 7. Pontos em aberto / a confirmar durante a execução

- **P1 — Acesso do aluno:** `GET /agenda/student/:studentId` ficará sob `AuthGuard` (qualquer logado).
  Endurecer para "só o próprio `sub` do token ou professor" é opcional (anotar se necessário).
- **P2 — Duração do slot:** assumido **1 hora** (8h–20h de hora em hora). Se as aulas tiverem outra
  duração/granularidade, ajustar `HOURS`.
- **P3 — Aluno em duas alocações no mesmo (dia,hora):** impossível por construção (1 ocupante/slot),
  mas um aluno **avulso** e uma **turma** que o contém poderiam cair no mesmo horário em **slots de
  dias diferentes** — sem conflito. Nada a tratar.
- **P4 — Exclusão de aluno:** ao excluir um aluno (spec 001), convém remover suas alocações avulsas e
  tirá-lo das turmas. Fora do escopo desta spec; anotar como follow-up se surgir.

---

## 8. Progresso

| Fase | Repo | Branch | Status |
|------|------|--------|--------|
| 1 — Turmas API | be | `feature/fase1-turmas-api` | ✅ Concluída e pushada |
| 2 — Agenda API | be | `feature/fase2-agenda-api` | ✅ Concluída e pushada |
| 3 — Fundação Agenda | fe | `feature/fase3-agenda-fundacao` | ✅ Concluída e pushada |
| 4 — Grade do professor | fe | `feature/fase4-agenda-professor` | ✅ Concluída e pushada |
| 5 — Turmas na UI | fe | `feature/fase5-turmas-ui` | ✅ Concluída e pushada |
| 6 — Horário do aluno | fe | `feature/fase6-agenda-aluno` | ✅ Concluída e pushada |
| Release (be) | be | `release/agenda` | ✅ **PR #9** → https://github.com/TheLastJedi00/barbarafarias-api/pull/9 |
| Release (fe) | fe | `release/agenda` | ✅ **PR #10** → https://github.com/TheLastJedi00/fariasbarbara/pull/10 |

> **Base das branches (desvio consciente, como na spec 001):** BE empilhado em
> `refactor/arquitetura-e-simplificacao` (a `main` não tem o `FirestoreModule` atual); FE empilhado
> no topo da spec 001 (a `main` não tem esse trabalho — PR pendente). Cada PR de release inclui esse
> trabalho-base até ele ser mesclado; documentado no corpo dos PRs. **PRs não mesclados** (aguardando o usuário).
>
> **Decisões de implementação:** dependência unidirecional Agenda→Turma (sem ciclo); RF8 implementado
> por filtragem de slots órfãos (turmas excluídas somem da grade) em vez de cascade; `studentName`/
> `turmaName` são denormalizados (renomear turma não atualiza slots já gravados — limitação de MVP).
