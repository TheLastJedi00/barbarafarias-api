# Tasks — Spec 011: Backend (barbarafarias-api)

> Base e alvo = **`dev`**. Fases **empilhadas** (`faseN` sai de `faseN-1`); 1 task = 1 commit atômico.

## Fase 1 — Perfis e Mapeamento de Imagens · `feature/fase1-perfis-imagens`
- **Task 1** — Atualizar entidade `User` e DTOs (`Teacher` e `Student`) para incluir novos campos: `profileImageUrl` e `bio` (apenas para professora).
- **Task 2** — Ajustar `UserService` e `TeacherService` para aceitar a atualização dos novos campos de perfil.

## Fase 2 — Refatoração da Agenda (30 min) · `feature/fase2-agenda-30min`
- **Task 1** — Refatorar o modelo de `AgendaSlot` e docIds para suportar intervalos de 30 minutos (ex: `08:00`, `08:30`).
- **Task 2** — Atualizar a lógica de alocação de aula padrão (1 hora) para ocupar obrigatoriamente 2 slots consecutivos na criação/reserva.
- **Task 3** — Testes: Garantir que a reserva dupla não cause sobreposição (*double booking*) e valide os intervalos perfeitamente.

## Fase 3 — Artigos (Novo Módulo) · `feature/fase3-artigos`
- **Task 1** — Criar entidade `Article` (`title`, `content`, `coverImageUrl`, `authorId`, `createdAt`, `updatedAt`) e repositório.
- **Task 2** — Criar `ArticleService` e `ArticleController` com CRUD completo, protegido por `@Roles(MANAGER)`. Leitura (`GET`) aberta a alunos e professoras.

## Fase 4 — Permissões Restritas e Financeiro · `feature/fase4-permissoes-financeiro`
- **Task 1** — Aplicar Guards rigorosos nas rotas de Gestão de Alunos. Somente `MANAGER` pode criar alunos.
- **Task 2** — Modificar a listagem de alunos: `GET /students` para a professora retorna apenas os vinculados ao seu `teacherId`.
- **Task 3** — Criar endpoint financeiro para a professora (`GET /finance/teacher/me`), retornando cálculo de faturamento (mensal/semanal) baseado nos alunos ativos e valor-hora.

## Bug Fixes
- **Fix [Nest] 23164 (Firestore undefined field `profileImageUrl`)** — Configuramos o Firestore em `FirestoreModule` com a opção `ignoreUndefinedProperties: true` para ignorar propriedades indefinidas, prevenindo crashes ao tentar salvar objetos com valores `undefined` via repositório.
