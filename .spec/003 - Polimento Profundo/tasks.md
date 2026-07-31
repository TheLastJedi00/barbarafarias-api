## 3. Fases & Tasks

> Cada **Fase** = uma branch `feature/faseN-*` criada a partir do topo da fase anterior (empilhadas,
> a 1ª a partir de `release/agenda`). Cada **Task** = **1 commit atômico** (prefixo `feat|fix|refactor|chore`).
> Push ao fim de cada fase. **Sem PR por fase.** PR único na release. Build verde ao fim de cada fase.

### Fase 1 — Fundação do rebranding · `feature/fase1-shell-e-kit`
Criar a base reusável que as fases 2 e 3 vão aplicar.

1. `feat: cria componente page-shell (cabeçalho padrão: back-button + título gold + subtítulo + área de conteúdo) para páginas internas (Task 1)`
   - Dumb component em `shared/layout/` (ou `shared/ui/`): inputs `title`, `subtitle?`, `backLabel?`;
     output `back`. Renderiza o cabeçalho `font-playfair text-gradient-gold` + `&lt;app-back-button&gt;` +
     `&lt;ng-content&gt;` para o corpo. Entrada animada no header (`slide-in-from-top-4`). É o wrapper que
     dá consistência a todas as telas internas.
2. ⏭️ **Foldada** — `adiciona ao switch-icons os ícones faltantes (Task 2)`. Auditoria (2026-07-06)
   mostrou **zero SVGs hardcoded** nas páginas de escopo (a Spec 001 Fase 2 já os extraiu) e o
   `switch-icons` já cobre o conjunto comum. Qualquer ícone novo eventualmente necessário é
   adicionado **on-demand** dentro da task da página que o usa, não como task separada.

### Fase 2 — Rebrand do lado do professor · `feature/fase2-rebrand-professor`
Aplicar o `page-shell` + glass + gold + animação nas telas do professor.

1. `feat: rebrand da página de alunos (page-shell, cards glass, back-button, entrada animada) (Task 1)`
2. `feat: rebrand da página de materiais/supply-list (Task 2)`
3. `feat: rebrand da página de gerar material (form on-brand, glass) (Task 3)`
4. `feat: rebrand do video-manager (cabeçalho/containers glass, reusa app-accordion) (Task 4)`
5. `refactor: alinha a agenda ao padrão do rebranding (page-shell/título/animações) (Task 5)` — auditoria leve.

### Fase 3 — Rebrand do lado do aluno · `feature/fase3-rebrand-aluno`
Aplicar o mesmo padrão nas telas do aluno (inclui componentes filhos).

1. `feat: rebrand da tela de conteúdo do aluno e seus filhos (topic-section, flashcard-grid, roleplay-card, module-accordion, music-recommendation) (Task 1)`
2. `feat: rebrand da tela de videoaulas (Task 2)`
3. `feat: rebrand da tela de material de apoio (Task 3)`
4. `feat: rebrand da tela de IPA (Task 4)`
5. `refactor: alinha o painel do aluno ao padrão do rebranding (Task 5)` — auditoria leve.

### Fase 4 — Polimento final · `feature/fase4-polish`
Consistência transversal entre todas as páginas rebrandeadas.

1. ⏭️ **Foldada** — `estados de loading/erro/vazio on-brand (Task 1)`. Auditoria (2026-07-06):
   os estados já foram entregues **dentro dos reskins de cada página** (caixas de erro glass
   `text-red-200 bg-red-900/40`, `@empty` `text-white/60`, loading via `rise-circle`/`fullscreen`).
   Varredura de `console.error` confirmou que todas as páginas de escopo que capturam erro **também
   exibem feedback** (students→`errorMessage`, video-manager→`feedback-modal`, generate→`responseMessage`,
   agenda→banner, videoclass/content-view→`errorMessage`, student-panel→`scheduleError`). Nada silencioso
   restante → sem task separada.
2. `feat: aplica reveal-on-scroll (RevealDirective) nas telas longas (ipa, conteúdo do aluno) e remove o hack de padding fixo .page/.dashboard-grid (0 25rem) do styles.css (Task 2)`
   — primeira aplicação real da `RevealDirective` (antes criada e nunca usada).
3. `refactor: remove imports órfãos (RouterLink em supply-list, signal em support-material) — build 100% sem warnings (Task 3)`

### Release — `release/polimento-profundo` (a partir do topo da Fase 4)
- `docs: documenta a identidade visual unificada e o page-shell (release polimento-profundo)` ✅
- **PR único aberto via API do GitHub** (token do GCM; `gh` CLI e `abrir-pr.sh` ausentes na máquina, usado `curl` direto).
  - **PR #11:** https://github.com/TheLastJedi00/fariasbarbara/pull/11
  - **Base = `release/agenda`** (não `main`): as specs 001 (PR #9) e 002 (PR #10) ainda não foram
    mescladas; basear em `release/agenda` isola **apenas** o diff da spec 003 para revisão. Retargetar
    para `main` quando 001/002 forem mescladas. **Não mesclado** (aguardando o usuário).

---
