## 6. Fases & Tasks

> Cada **Fase** = uma branch `feature/faseN-*` no **repo indicado**, a partir da `main` desse repo.
> Cada **Task** = **1 commit atômico** (`feat|fix|chore|refactor`). Push por fase. PR só na release.

### Fase 1 — [BE] Turmas API · `feature/fase1-turmas-api` (`barbarafarias-api`)
1. `feat: cria TurmaModule, entity e DTOs (create/update) (Task 1)`
2. `feat: implementa TurmaRepository (Firestore) com CRUD (Task 2)`
3. `feat: implementa TurmaService e TurmaController com @Roles(TEACHER) (Task 3)`
4. `chore: registra TurmaModule no AppModule (Task 4)`

### Fase 2 — [BE] Agenda API · `feature/fase2-agenda-api` (`barbarafarias-api`)
1. `feat: cria AgendaModule, entity (ocupante polimórfico) e DTO (Task 1)`
2. `feat: AgendaRepository (Firestore) com upsert por dayOfWeek_hour e liberação de slot (Task 2)`
3. `feat: AgendaService com resolução do horário do aluno (avulso + turmas) (Task 3)`
4. `feat: AgendaController (GET grade, POST atribuir, DELETE liberar, GET /student/:id) (Task 4)`
5. `feat: ao excluir turma, libera slots que a referenciam (RF8) (Task 5)`
6. `chore: registra AgendaModule no AppModule (Task 6)`

### Release
- **`release/agenda`** em **cada repo** que a spec tocou (`barbarafarias-api` e `fariasbarbara`).
- README atualizado (BE: endpoints/estrutura de dados de agenda e turmas; FE: produto/agenda).
- **1 PR por repo** contra a `main`, via API do GitHub (token do GCM). Entregar as URLs. **Não** mesclar
  sem o usuário pedir.

---
