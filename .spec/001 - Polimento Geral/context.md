# Spec 001 — Polimento Geral (Frontend `fariasbarbara`)

> **Objetivo macro:** deixar o front-end mais **estável e rápido**, consolidando o padrão
> **smart pages / dumb components** (a página faz requisições, o componente só recebe dados),
> componentizando ícones/botões/molduras/cards/accordions, criando animações, melhorando
> roteamento, usando **token em memória**, refazendo forms que se comportam mal e — com
> prioridade — **redesenhando o Teacher Dashboard** (a área que mais peca).
>
> **Princípio norteador:** manter o TypeScript **enxuto e simples**. Preservar o que já funciona
> (ex.: `video-manager`, que já segue o padrão correto) e usá-lo como referência. Nada de
> abstrações genéricas complexas; componentização pragmática.

- **Repositório:** `fariasbarbara` (`github.com/TheLastJedi00/fariasbarbara`)
- **Stack:** Angular 20 (standalone, zoneless, signals), Tailwind CSS v4, RxJS 7
- **Data de abertura:** 2026-07-04
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas a partir da `main`, 1 commit por task,
  push por fase, **1 único PR por repo** na branch de release.

---

## 1. Diagnóstico do estado atual

### 1.1 Arquitetura & Roteamento
| # | Problema | Local |
|---|----------|-------|
| A1 | Rota `academy` **declarada 2x** (duplicada) | `app.routes.ts:65,68` |
| A2 | `provideRouter` chamado **2x** (em `app.config.ts` **e** exportado em `appRoutingProviders`) | `app.config.ts:12`, `app.routes.ts:71` |
| A3 | `teacherGuard` redireciona para `/teacher-login` — **rota inexistente** | `teacher.guard.ts:11` |
| A4 | Rota `prompt` aponta para `TeacherDashboard` com `authGuard` (deveria ser `teacherGuard`, ou ser removida — parece morta) | `app.routes.ts:35` |
| A5 | Só `student-content` é lazy; **todo o resto é eager** → bundle inicial maior/mais lento | `app.routes.ts` |
| A6 | Sem agrupamento de rotas (público / teacher / student) nem 404 dedicado | `app.routes.ts:67` |
| A7 | Token JWT persistido em `localStorage` — pedido: **token em memória** | `auth.service.ts:28,55,62` |
| A8 | Interceptor **não trata 401** (sem auto-logout em expiração) | `auth.interceptor.ts` |
| A9 | `header` decide "está no painel?" por **lista hardcoded de URLs** (regra de negócio frágil) | `header.component.ts:81-92` |

### 1.2 Convenção & Estrutura de pastas
| # | Problema | Local |
|---|----------|-------|
| B1 | Mistura de convenções: `*.component.ts` (antigo) vs `*.ts` (novo); classes com/sem sufixo `Component` | projeto todo |
| B2 | `shared/` **plana e inconsistente** (uns em subpasta `button/`,`cards/`,`icon/`,`loading/`; outros na raiz) | `shared/` |
| B3 | **Dois** `DashboardButton` com **mesmo seletor** `app-dashboard-button` e APIs divergentes (`(click)`+ícone vs `(action)` sem ícone) | `shared/button/dashboard-button` vs `shared/dashboard-button` |
| B4 | Métodos stub mortos (`throw new Error("...not implemented")`) | `user.service.ts:22,30`, `video.service.ts:17,26` |
| B5 | Imports/variáveis mortos, `console.log` esquecidos | `supply-list.ts:5,7,9`, `generate.ts:48`, `students.ts:152` |
| B6 | `header` e `registration-form` estão em `shared/` mas contêm **lógica de negócio/HTTP** (não são dumb) | ver 1.4 |

### 1.3 Modelos de dados
| # | Problema | Local |
|---|----------|-------|
| C1 | `Student` e `User` são praticamente a **mesma entidade** duplicada | `student.model.ts`, `user.model.ts` |
| C2 | Campo `objective` (singular, em `Student`) vs `objectives` (plural, em `User`) → força mapeamento manual | `registration-form.ts:82` |
| C3 | `level` é `string` livre em `Student`, union tipada em `User` | idem |
| C4 | **Bug:** `Teacher extends Omit<User,'objective'...>` mas o campo em `User` é `objectives` → `Omit` não remove nada | `teacher.model.ts` |
| C5 | `VideoModule.topic` é array mas nome está no singular | `video.model.ts` |
| C6 | `LoginResponse`/`JwtPayload` definidos inline no service (sem model) | `auth.service.ts:8-18` |

### 1.4 Componentização (Design System)
| # | Problema | Local |
|---|----------|-------|
| D1 | **53 SVGs hardcoded** em 24 arquivos, apesar de existir `shared/icon/` | `generate.html` (9), `supply-list.html` (6), `students.html` (5), `academy`, `student-content-view`, `cta-button` (3x WhatsApp), `service-card` (typo `1.so`) |
| D2 | Ícones internos inconsistentes: metade com SVG inline no `.ts`, metade em `.html` | `shared/icon/*` |
| D3 | Botão **"Voltar/Retornar" reimplementado inline** ≥6x (3x só dentro de `generate`) | `ipa`, `videoclass`, `support-material`, `students`, `supply-list`, `generate` |
| D4 | Cards de "steps" copy-paste (3x) que deveriam ser `*ngFor`/componente | `academy.html:92-127` |
| D5 | Accordions duplicados (`module-accordion` + acordeões do `video-manager`) sem base comum | pages |
| D6 | Ausência de animações de entrada/reveal-on-scroll; só hovers pontuais | `landing`, `academy`, dashboard |
| D7 | `feature.icon` (SVG em string TS) **código morto** — HTML ignora e usa SVG fixo | `academy.ts:35,41` + `academy.html:54` |

### 1.5 Forms mal-comportados
| # | Problema | Local |
|---|----------|-------|
| E1 | `registration-form` é **smart** (injeta `UserService`, faz POST) dentro de `shared/`; não limpa estado ao reabrir | `registration-form.ts:69,86` |
| E2 | Form de edição de aluno **sem `Validators`** (`form.invalid` nunca dispara); signals de feedback mortos; `errorMessage` nunca é limpo; `onSubmit()` vazio | `students.ts` |
| E3 | `login` **sem `Validators`** (email/required) e **importa API interna** `ɵInternalFormsSharedModule` | `login.component.ts:6,45` |
| E4 | `generate` depende de `history.state` **sem fallback** (F5 quebra a tela); `UserService` injetado e nunca usado | `generate.ts:27-41` |

### 1.6 Bugs funcionais & UX
| # | Problema | Local |
|---|----------|-------|
| F1 | `video-item`: inputs **sem binding** e botão "Salvar Alterações" **sem `(click)`** → edição inoperante | `video-item` |
| F2 | `videoclass`: `expandButtonText` é **signal global** → muda o texto de **todos** os tópicos ao expandir um | `videoclass.ts:22` |
| F3 | `supply-list`: `generateButton` **nunca reseta** entre alunos | `supply-list.ts:69` |
| F4 | `student-content-view`: `errorMessage` (signal `string`) recebe **objeto `Error`**; `openThisModule()` confuso | `student-content-view.component.ts:84,49` |
| F5 | **Falhas silenciosas** (catch só `console.error`, sem feedback ao usuário) | `student-panel.ts:85`, `videoclass.ts:53` |
| F6 | `[innerHTML]` com conteúdo dinâmico (**risco XSS**) | `roleplay-card.html:15`, `videoclass.html:36`, topic |
| F7 | HTML inválido: `<h1>` com `<h2>` aninhado; `<img priority>` (atributo inválido fora de `NgOptimizedImage`) | `ipa.html`, `academy` |

### 1.7 Teacher Dashboard — **foco principal** (o que mais peca)
- **3 de 6 botões `[disabled]`** ("Agenda", "Feedback", "Financeiro") sem indicação de "em breve" → parece morto/quebrado.
- Espaçamento **hardcoded** `md:px-[20vw]` e `padding: 0 25rem` → quebra em telas intermediárias/ultrawide.
- **Sem hierarquia visual**: todos os botões têm o mesmo peso, sem ícones, descrição ou métricas (nº de alunos, pendências).
- Saudação **"Bem Vindo(a), Teacher!" hardcoded** — não usa o nome real.
- Form de "Nova Matrícula" **substitui o botão inline** em vez de abrir modal (há `shared/modal` ocioso).
- Sem animações de entrada.

---

## 2. Estrutura-alvo de pastas (`src/app`)

```
core/
  guards/            auth.guard, teacher.guard
  interceptors/      auth.interceptor (com 401 → logout)
  services/          auth, user, supply, video (sem stubs mortos)
  layout/            header  (movido de shared — depende de Auth/Router)
  config/            app-constants (whatsappLink, logo/imagens, links externos)
models/              user (unificado c/ Student), teacher, content, supplyInfo, video, auth
pages/               (smart) — cada page orquestra HTTP; HTML enxuto delegando a dumb components
shared/
  ui/
    button/          button (variantes), icon-button, back-button, dashboard-button (unificado), cta-button
    card/            frame/card genérico, service-card, testimonial-card, video-card, student-intro-card
    accordion/       accordion genérico
    icon/            todos os ícones + switch-icons (convenção única)
    loading/         rise-circle, fullscreen-loading (texto via input)
  feedback/          modal (base), confirm-modal, feedback-modal (funde error-modal), level-selector-modal
  form/              form-field (input/textarea/select dumb), registration-form (dumb: emite submit)
  animations/        diretiva/util de reveal-on-scroll + presets fade/slide
```

**Convenção adotada:** padrão novo do Angular — arquivos **sem** sufixo `.component`, classes **sem** sufixo `Component`. (Renomeações agrupadas por task para manter commits legíveis.)

---


## 4. Decisões & observações

- **Token em memória:** o JWT deixará de ser persistido em `localStorage`; ficará num `signal` em memória.
  *Trade-off consciente:* refresh (F5) desloga o usuário (não há endpoint de refresh na API atual).
  Aceito por ser o pedido explícito e por reduzir superfície de XSS/roubo de token.
- **Simplicidade:** sem introduzir NgRx/facades pesadas. As pages continuam smart (chamam services
  diretamente); a melhoria é isolar HTTP em services e deixar componentes puramente dumb.
- **`video-manager` é a referência de qualidade** (smart container + filhos dumb com ReactiveForms
  validados) — replicar o padrão, não reinventar.
- **Backend (`barbarafarias-api`)** não é escopo desta spec; qualquer stub morto no front que dependa
  de endpoint inexistente é apenas removido, não implementado no back.
- **Páginas novas** entregues: 404 dedicada (Fase 1), placeholders "em breve" (Fase 6) e login do
  professor (Fase 6). Novas páginas de produto além dessas serão avaliadas conforme necessidade.

---

## 5. Progresso

| Fase | Branch | Status |
|------|--------|--------|
| 1 — Fundação & Arquitetura | `feature/fase1-fundacao-arquitetura` | ✅ Concluída e pushada |
| 2 — Design System | `feature/fase2-design-system` | ✅ Concluída e pushada |
| 3 — Teacher Dashboard | `feature/fase3-teacher-dashboard` | ✅ Concluída e pushada |
| 4 — Forms | `feature/fase4-forms` | ✅ Concluída e pushada |
| 5 — Smart/Dumb & bugs | `feature/fase5-pages-smart-dumb` | ✅ Concluída e pushada |
| 6 — Páginas novas & polish | `feature/fase6-polish-paginas-novas` | ✅ Concluída e pushada |
| Release | `release/polimento-geral` | ✅ **PR #9 aberto** → https://github.com/TheLastJedi00/fariasbarbara/pull/9 |

> **Base das branches:** empilhadas a partir de `fix/video-manager` (= `main` + commit do video-manager,
> a referência de qualidade), não da `main` pura — desvio consciente para não descartar esse trabalho.
>
> **Tasks folded/adiadas (decisões conscientes, "mantenha o básico que funciona"):**
> - Fase 1 Task 2 (renomear `.component` em massa) — cosmético, alto churn/risco, sem ganho funcional.
> - Fase 4 Task 1 (form-fields atômicos) — evitar abstrações não usadas; forms já validam inline.
> - Fase 5 Tasks 1–2 (decompor students/supply-list/generate em dumb) — pages já são smart e delegam
>   a componentes dumb; decomposição adicional é refino, não correção.
> - Fase 6 Tasks 1–2 (placeholders "em breve" / teacher-login) — cards "em breve" não são clicáveis
>   (não precisam de rota) e o `teacherGuard` já redireciona para `/login` (404 dedicada criada na Fase 1).
> - Fase 5 Task 6 (XSS) — `[innerHTML]` já é auto-sanitizado pelo Angular (sem `bypassSecurityTrustHtml`);
>   o commit entregou a correção do toggle de módulo no lugar.
