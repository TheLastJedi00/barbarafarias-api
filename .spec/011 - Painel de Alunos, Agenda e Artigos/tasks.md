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

---

# Correções pós-release · `fix/spec-011-pontas-soltas`

> Auditoria de 2026-08-01 (ver `fix.md` na raiz das specs, seção "Auditoria de pontas
> soltas"). Fluxo: github-flow §5.2.2 — branch `fix/`, saída da `dev` atualizada, PR próprio
> contra a `dev`. 1 task = 1 commit.

## Decisões de escopo

Registradas aqui conforme github-flow §5.2.1.1.

1. **Um branch/PR por repo, não por achado.** O §5.2.2 pede um PR por correção; 18 achados
   viraria 18 PRs de uma auditoria só, e vários deles se cruzam (o mesmo arquivo de artigos
   resolve A4, A5, A6 e A10). Agrupamos por repositório, mantendo **um commit por achado**
   para a rastreabilidade que a regra busca.
2. **Fluxo de artigos: completar em vez de remover** (decisão do dono). A professora passa a
   escrever — artigo dela nasce `pending` —, a gerente ganha Aprovar/Recusar, e o não
   publicado some da biblioteca do aluno. `reject` devolve a `draft` em vez de apagar.
3. **Artigos da Fase 3 valem como publicados.** Nasceram sem o campo `status`; como todos
   eram da gerente e já estavam no ar, ler a ausência como `draft` faria o material antigo
   sumir da biblioteca no dia em que o filtro entrasse.
4. **`404` e não `403` no artigo que o usuário não pode ler.** Quem não lê também não
   precisa saber que o artigo existe.
5. **A11 fecha uma brecha anterior à spec 011.** As rotas `:id` de usuário não eram escopo
   declarado desta spec, mas estão dentro do perímetro que o RF2.1 delimita e no módulo que
   a Fase 4 tocou — deixar passar seria documentar uma exposição conhecida.

## Tasks

- **Task 1** — `LessonService.ensureLessons` materializa uma aula por bloco (`isBlockStart()`)
  em vez de uma por meia-hora. Fixture do par + cobertura da meia-hora que é início do
  próprio bloco. **(A1 — crítica: repasse dobrado)**
  `fix: materializa uma aula por bloco em vez de uma por meia-hora (Fix A1)`
- **Task 2** — `CreateRescheduleDto.proposedHour` e `WeeklySlotDto.hour` aceitam a grade de
  30 min. `IsHalfHourStep` sai do DTO da agenda para `common/`, onde os três módulos o
  alcançam. **(A3)**
  `fix: aceita meia-hora no reagendamento e no slot de reposicao (Fix A3)`
- **Task 3** — Artigos: recorte por status e papel na listagem e no detalhe, `?status=`
  passa a valer, autoria exigida na escrita, `POST /:id/reject`, telefone do autor sob
  `phoneVisibleToStudent`. **(A4, A5, A6, A10)**
  `fix: recorta artigos por status e autoria, e fecha o fluxo de aprovacao (Fix A4, A5, A6, A10)`
- **Task 4** — `GET /users/:id` e `PUT /users/:id` recortados por papel de quem pede. **(A11)**
  `fix: recorta GET e PUT /users/:id por papel de quem pede (Fix A11)`
- **Task 5** — `AgendaService.assign` apaga a meia-hora que sobra ao encurtar um bloco. **(A17)**
  `fix: limpa a meia-hora orfa ao encurtar um bloco da agenda (Fix A17)`
- **Task 6** — README: materialização por bloco, ciclo de vida dos artigos, escopo das rotas
  `:id` e a grade de 30 min nos DTOs de horário.
  `docs: documenta o recorte de artigos, o escopo de /users/:id e a grade de 30min`

## Não corrigidos (registrados como dívida)

- **A13 — senhas antigas no Firestore:** **resolvido pelo dono**, que limpou a base
  manualmente em 2026-08-01. A prevenção no `UserService` já estava no ar. Não há script a
  escrever.
- **A15 — arquivos órfãos no Storage:** `StorageService.remove()` segue sem chamador. Ligar
  exige guardar o `path` no documento (hoje só a URL é gravada) e decidir o que fazer com
  URLs compartilhadas. É custo silencioso, não defeito funcional.
- **A7 — `students-requests` sempre vazio:** o endpoint fica de pé para um fluxo futuro de
  pedido pelo aluno; a seção morta sai do front (ver tasks do FE).
- **Aula de 30 min pela interface:** o DTO e a grade suportam `slotCount: 1`, mas nenhuma
  tela envia. Fica registrado como funcionalidade não exposta, não como bug.

---

## Bug Fixes
- **Fix [Nest] 23164 (Firestore undefined field `profileImageUrl`)** — Configuramos o Firestore em `FirestoreModule` com a opção `ignoreUndefinedProperties: true` para ignorar propriedades indefinidas, prevenindo crashes ao tentar salvar objetos com valores `undefined` via repositório.
- **Fix 404 Cannot POST /uploads/avatars** — Adicionado o `UploadModule` no array de `imports` do `AppModule`. O módulo existia, mas não estava registrado na raiz da aplicação.
- **Fix 400 Bad Request em /teachers/me** — Adicionada a propriedade `phoneVisibleToStudent` ao `UpdateTeacherProfileDto` com os decorators de validação corretos. Isso permite que a requisição principal de atualização do perfil da professora processe essa chave, resolvendo o erro de restrição de whitelist do class-validator.
