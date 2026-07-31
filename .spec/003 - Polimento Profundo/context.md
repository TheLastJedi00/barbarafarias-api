# Spec 003 — Polimento Profundo (Rebranding das páginas de dashboard)

> **Objetivo macro:** aplicar a **mesma linguagem visual / rebranding** que a Spec 001 deu ao
> **Teacher Dashboard** a **todas as páginas derivadas dos dashboards**, dos **dois lados**
> (professor e aluno). Onde a Spec 001 fez um polimento superficial (arquitetura, design system,
> redesign só do dashboard do professor), a 003 vai **fundo na camada visual das telas internas**:
> converter os layouts legados (cards brancos, botões "voltar" inline, sem animação) para o
> padrão glass/roxo/gold já consolidado.
>
> **Princípio norteador:** **reusar o kit que já existe** (não criar design system novo). Todos os
> blocos — `app-frame` (glass), `app-back-button`, `app-switch-icons`, `.text-gradient-gold`,
> `RevealDirective`, presets `animate-in` — já estão prontos em `src/app/shared/`. O trabalho é
> **aplicar**, não inventar. TypeScript enxuto; preservar comportamento funcional das telas.

- **Repositório:** `fariasbarbara` (`github.com/TheLastJedi00/fariasbarbara`)
- **Stack:** Angular 20 (standalone, zoneless, signals), Tailwind CSS v4 (sem `tailwind.config`; tokens em `src/styles.css`), RxJS 7
- **Data de abertura:** 2026-07-06
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas, 1 commit por task, push por fase, **1 único PR** na branch de release.
- **Base das branches:** empilhadas a partir de **`release/agenda`** (topo atual = Spec 001 + Spec 002).
  A `main` **não** contém specs 001/002 (PRs #9 e #10 ainda não mesclados), então — como nas specs
  anteriores — as fases saem do topo do trabalho já feito, não da `main` pura. Desvio consciente do
  github-flow; a release inclui a base até ser mesclada.

---

## 1. Escopo — páginas a rebrandear

Definição de "derivada de dashboard": tela alcançável navegando a partir do Teacher Dashboard
(`/teacher-dashboard`) ou do Student Panel (`/student/:studentId`).

### 1.1 Lado do professor (a partir do Teacher Dashboard)
| Página | Rota | Arquivo | Estado atual |
|--------|------|---------|--------------|
| Lista de alunos | `/students` | `pages/students/students.ts` | Legado — reskin |
| Materiais (supplies) | `/supplies` | `pages/supply-list/supply-list.ts` | Legado — reskin |
| Gerar material | `/generate/:id` | `pages/generate/generate.ts` | Legado — reskin |
| Video Manager | `/video-manager` | `pages/video-manager/video-manager.ts` | Legado — reskin |
| Agenda | `/agenda` | `pages/agenda/agenda.ts` | Spec 002 (já moderno) — **auditar/alinhar** |

### 1.2 Lado do aluno (a partir do Student Panel)
| Página | Rota | Arquivo | Estado atual |
|--------|------|---------|--------------|
| Conteúdo do aluno | `/student-content/:supplyId` | `pages/student-content-view/student-content-view.component.ts` (+ filhos em `components/`: `topic-section`, `flashcard-grid`, `flashcard-word`, `music-recommendation`, `roleplay-card`, `module-accordion`) | Legado — reskin |
| Videoaulas | `/videoclass/:level/:id` | `pages/videoclass/videoclass.ts` | Legado — reskin |
| Material de apoio | `/material/:id` | `pages/support-material/support-material.ts` | Legado — reskin |
| IPA (fonética) | `/ipa/:id` | `pages/ipa/ipa.ts` | Legado — reskin |
| Painel do aluno (dashboard) | `/student/:studentId` | `pages/student-panel/student-panel.component.ts` | Spec 002 (já moderno) — **auditar/alinhar** |

> **Fora de escopo:** `academy`, `landing/home`, `login`, `not-found` (públicas, não são filhas de
> dashboard). O **Teacher Dashboard** já é o modelo de referência (redesenhado na Spec 001) — não se mexe.

### 1.3 Decisões de escopo confirmadas pelo usuário (2026-07-06)
- **Páginas já modernas (agenda + student-panel): auditar e alinhar.** Não é reskin do zero — só
  corrigir o que destoar do padrão do Teacher Dashboard (header/título gold, entrada animada,
  consistência de glass cards). Task leve, não fase inteira.
- **Consistência via shell compartilhado.** Uma task de fundação cria um componente de layout de
  página interna (cabeçalho padrão + área de conteúdo) reusado por todas as páginas rebrandeadas —
  em vez de repetir o cabeçalho inline em cada uma.

---

## 2. Design kit de referência (já existe — reusar)

Linguagem-alvo (extraída do Teacher Dashboard da Spec 001):

- **Fundo:** gradiente roxo diagonal `from-[#271C29] to-[#503357]` — **já global** no `app-root`
  (`src/app/app.component.ts`); toda página só precisa usar `text-white`.
- **Títulos:** Playfair Display + `.text-gradient-gold` (`&lt;h1 class="font-playfair … text-gradient-gold"&gt;`).
- **Cards:** vidro — `bg-white/10 border border-white/15 rounded-2xl` → **`&lt;app-frame variant="glass"&gt;`**
  (`shared/cards/frame/frame.ts`). Substitui os `.card` brancos legados.
- **Acento gold:** chips/CTAs `bg-gradient-to-r from-[#DCAC44] to-[#EEDDBA] text-[#271C29]`.
- **Ícones:** `&lt;app-switch-icons [icon]="..." size="6" /&gt;` (`shared/icon/switch-icons/switch-icons.ts`);
  nomes disponíveis: `book-open, calendar-days, chevron-down, close, edit, play, search, sparkles,
  trash, arrow-left, info, alert-triangle, check, spinner, whatsapp`. Ícone novo → novo `@case` aqui.
- **Voltar:** `&lt;app-back-button variant="ghost|bar" (back)="..."&gt;` (`shared/button/back-button/back-button.ts`) —
  substitui os botões "voltar" reimplementados inline em cada página.
- **Botões:** `&lt;app-button variant="purple|white|red|purple-sm"&gt;` (`shared/button/button/button.ts`).
- **Accordion:** `&lt;app-accordion&gt;` (`shared/accordion/accordion.ts`) — já usado no video-manager e module-accordion.
- **Modais:** família em `shared/feedback/` (`modal`, `confirm-modal`, `feedback-modal`, `level-selector-modal`).
- **Animações:**
  - Entrada estática: `animate-in fade-in slide-in-from-bottom-4` + stagger `[style.animation-delay.ms]="i*80"`.
  - Reveal-on-scroll: **`RevealDirective`** (`shared/animations/reveal.directive.ts`, seletor `[appReveal]`)
    — **pronta mas ainda não aplicada em lugar nenhum**; esta spec é onde ela passa a ser usada.
  - Micro-interações: `hover:-translate-y-1 active:scale-98 transition-all duration-200`.
- **Estados:** loading via `app-fullscreen-loading`/`app-rise-circle`; erro/vazio devem seguir o
  padrão glass + texto `text-white/70` (hoje várias telas têm `console.error` silencioso).

---


## 4. Decisões & observações

- **Só camada visual.** Esta spec **não** altera comportamento/HTTP/roteamento — as pages continuam
  smart como estão. Se um bug funcional aparecer durante o reskin, corrige-se junto (`fix:`) só se
  for trivial e no caminho; senão vira nota, não escopo.
- **Reuso obrigatório.** Antes de escrever markup novo, checar o kit da seção 2. Nada de recriar
  card/botão/ícone que já existe. `RevealDirective` sai do estado "criada mas nunca usada".
- **Páginas já modernas** (agenda, student-panel) entram como **auditoria/alinhamento**, não reskin —
  decisão do usuário (§1.3).
- **Base empilhada** em `release/agenda` (não `main`) — mesmo desvio consciente das specs 001/002,
  pois a `main` ainda não tem esse trabalho mesclado.
- **Tasks podem ser foldadas** com registro (como na Spec 001): se uma página já estiver suficientemente
  on-brand ou uma task não agregar, documentar a decisão em vez de forçar commit vazio.

---

## 5. Progresso

| Fase | Branch | Status |
|------|--------|--------|
| 1 — Fundação (shell + kit) | `feature/fase1-shell-e-kit` | ✅ Concluída e pushada |
| 2 — Rebrand professor | `feature/fase2-rebrand-professor` | ✅ Concluída e pushada |
| 3 — Rebrand aluno | `feature/fase3-rebrand-aluno` | ✅ Concluída e pushada |
| 4 — Polimento final | `feature/fase4-polish` | ✅ Concluída e pushada |
| Release | `release/polimento-profundo` | ✅ **PR #11 aberto** → https://github.com/TheLastJedi00/fariasbarbara/pull/11 |

> **Base das branches:** empilhadas a partir de `release/agenda` (spec 001 + 002). Cada fase saiu do
> topo da anterior. Build `ng build` verde ao fim de cada fase; build final **sem warnings**.
>
> **Tasks foldadas (decisões conscientes registradas acima):** Fase 1 Task 2 (ícones — nada hardcoded
> restante); Fase 4 Task 1 (estados on-brand — já entregues nos reskins de cada página).
