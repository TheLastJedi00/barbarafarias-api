# Spec 005 — Header SPA (navegação global expansível)

> **Objetivo macro:** transformar o **header** num ponto de navegação estilo **SPA**: um **botão de menu
> expansível** que, ao abrir, sobrepõe a página atual com um painel contendo **os mesmos destinos que
> hoje só existem no dashboard** — agora como **botões de texto com ícone, empilhados verticalmente**.
> Isso dá ao usuário acesso à navegação principal **de qualquer página**, sem precisar voltar ao
> dashboard. Vale para os **dois papéis**: professora (Teacher Dashboard) e aluno (Student Panel).
>
> **Princípio norteador:** o header já é **global** (envolve toda rota via `app.component`); a Spec 005
> apenas o promove de "logo + Login/Logout" para **navegação completa role-aware**, reaproveitando a
> **linguagem visual já consolidada**: sobreposição com **blur** (padrão dos modais), **paleta**
> roxo `#271C29` + **gold** `#DCAC44→#EEDDBA`, e as **transições** (`animate-in`, `duration-200/500`).
>
> **Não é** redesenho dos dashboards nem dos fluxos existentes — os modais e navegações continuam
> pertencendo às páginas. O header passa a ser mais um **gatilho** desses mesmos destinos.

- **Repositório:** `fariasbarbara` (`github.com/TheLastJedi00/fariasbarbara`)
- **Stack:** Angular 20 (standalone, zoneless, signals), Tailwind CSS v4, `@angular/router` (hash routing)
- **Data de abertura:** 2026-07-09
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas, **1 commit por task**, push por fase,
  **1 único PR** na branch de release.
- **Base das branches:** a partir da **`main` atualizada** (`2ea85ed`, pós-merge da Spec 004 / PR #17).
- **Escopo:** **somente frontend.** Nenhuma mudança de API — a role já vem no JWT
  (`AuthService.isTeacher()` / `getRole()`), e o `userId` no `sub`.

---

## 1. Estado atual — o header e a navegação hoje

### 1.1 O header (`core/layout/header/header.component.ts`)
Componente global, montado em `app.component.html` **acima do `<router-outlet>`** (aparece em todas as
rotas). Hoje contém apenas:
- **Logo** (link para `/home`);
- **1 CTA** que alterna entre "Home" (fora da home) e "BF Academy" (na home);
- **1 link** Login **ou** Logout, derivado de `auth.isLoggedIn()`.

Visual já alinhado: `sticky top-0 z-10 bg-[#271C29]/50 backdrop-blur-sm`. **Não há** nenhum acesso à
navegação principal do produto — para ir de uma página interna a outra seção, o usuário **volta ao
dashboard** e clica de novo.

### 1.2 Os destinos que vivem só no dashboard

**Teacher Dashboard** (`pages/teacher-dashboard`, cards inline com `<app-switch-icons>`):

| Ícone (`switch-icons`) | Rótulo | Destino | Tipo |
|---|---|---|---|
| `book-open` | Lista de Alunos | `/students` | rota |
| `sparkles` | Materiais | `/supplies` | rota |
| `play` | Vídeos | `/video-manager` | rota |
| `calendar-days` | Agenda | `/agenda` | rota |
| `sparkles` | Nova Matrícula | abre **modal** de matrícula na própria página | **ação** |
| `edit` / `info` | Feedback / Financeiro | — | *em breve* (desabilitados) |

**Student Panel** (`pages/student-panel`, usa `<app-dashboard-button>`):

| Ícone | Rótulo | Destino | Tipo |
|---|---|---|---|
| `book-open` | Materiais de Apoio | `/material/:studentId` | rota (usa `sub` do token) |
| `sparkles` | Conteúdo Personalizado | **modal** seletor de nível → `/material/:id` | **ação** |
| `play` | Aulas Gravadas | **modal** seletor de nível → `/videoclass/:level/:id` | **ação** |

> **Observação-chave:** nem todo "botão do dashboard" é uma rota simples. Alguns são **ações que abrem
> modais dependentes de contexto** (matrícula; seletores de nível). O header precisa reproduzi-los sem
> duplicar a hospedagem desses modais — ver §4.3.

### 1.3 Diagnóstico
1. **Navegação presa ao dashboard:** o header não expõe as seções; a única forma de trocar de seção é
   voltar ao painel. Fere o modelo mental SPA (navegar de qualquer lugar).
2. **Header subutilizado:** ocupa o topo de toda página mas só oferece Home/Login/Logout.
3. **Sem paridade de papéis:** não há uma fonte única dos itens de navegação por papel — os rótulos,
   ícones e destinos estão **hardcoded dentro de cada dashboard** (`actions[]` no teacher; markup no
   student), sem reuso.

---

## 2. Alvo — o que a Spec 005 entrega

1. **Botão de menu** (hambúrguer) no header, visível quando faz sentido navegar (ver §4.1 sobre estados
   deslogado/teacher/aluno).
2. Ao clicar, **abre um painel sobreposto** à página atual com **blur no fundo** (mesmo padrão dos
   `app-modal`: `fixed inset-0 bg-black/70 backdrop-blur-sm`).
3. O painel lista os **destinos do papel atual** como **botões de texto + ícone, empilhados na
   vertical**, na linguagem gold/glass. Inclui **Login/Logout** ao pé.
4. Selecionar um item **navega (ou dispara a ação)** e **fecha o menu**. Fechar também por **backdrop**,
   **Esc** e botão **×**.
5. Tudo **role-aware**: professora vê os itens do Teacher Dashboard; aluno vê os do Student Panel;
   deslogado vê Home/BF Academy/Login.
6. **Acessível e responsivo:** foco preso enquanto aberto, `aria-expanded`/`aria-modal`, alvo de toque
   ≥44px, `prefers-reduced-motion` respeitado, funciona de ~360px ao desktop.

---

## 3. Linguagem visual (tokens já existentes a reusar)

| Token | Valor | Onde já é usado |
|---|---|---|
| Roxo base | `#271C29` | `.bg-purple`, header atual |
| Roxo secundário | `#573359` / `#503357` | card de login (`bg-[#503357]/73`) |
| Gold (gradiente) | `linear-gradient(to right, #DCAC44, #EEDDBA)` | `.text-gradient-gold`, botões primários |
| Superfície glass | `bg-white/10 border border-white/15` | cards dos dashboards |
| **Sobreposição com blur** | `fixed inset-0 bg-black/70 backdrop-blur-sm` | `app-modal` (padrão a herdar) |
| Transições | `transition-all duration-200/300`, `animate-in fade-in slide-in-from-* duration-500` | dashboards, page-shell |

**Especificação do painel do menu (alvo):**
- **Backdrop:** `fixed inset-0 z-40 bg-black/70 backdrop-blur-sm`, entrada `fade-in`.
- **Painel:** superfície roxa translúcida (`bg-[#271C29]/80` ou glass), `z-50`, cantos arredondados,
  entrada `slide-in-from-top` (ou `-from-right` em drawer) `duration-300`.
- **Item:** botão full-width, `flex items-center gap-3`, ícone (`switch-icons`, size ~6) + rótulo em
  texto; hover glass (`hover:bg-white/10`), `active:scale-[.98]`; **empilhados verticalmente** (`flex flex-col`).
- **Rodapé:** Login **ou** Logout, visualmente separado (borda `border-white/10`).

---

## 4. Arquitetura

### 4.1 Fonte única de navegação — `HeaderNavService` (role-aware)
Um serviço (ou config `providedIn: root`) que expõe os itens de navegação **derivados do papel**:

```ts
type NavItem = {
  label: string;
  icon: string;            // chave do switch-icons
  route?: string;          // destino de rota (ex.: '/students', '/material/:id resolvido')
  openAction?: string;     // ação-modal a reproduzir (ex.: 'matricula', 'nivel-material')
  disabled?: boolean;      // "em breve"
};
items(): NavItem[]         // decide por auth.isLoggedIn()/isTeacher(); resolve :studentId via getUserId()
```

Isso **centraliza** o que hoje está espalhado (`actions[]` do teacher + markup do student). Os
dashboards **podem** passar a consumir a mesma fonte num follow-up (não obrigatório nesta spec — ver §5).

### 4.2 Componente dumb — `nav-menu` (overlay)
- **Dumb:** recebe `items` via `input()` e `open` via `input()`; emite `(navigate)` / `(close)`.
  **Não** injeta Router nem Auth — quem navega é o header (smart).
- Responsável pelo **painel + backdrop + blur + transições + a11y** (foco preso, Esc, scroll-lock).
- Renderiza os itens **empilhados verticalmente** (texto + ícone), rodapé Login/Logout.

### 4.3 Integração no header (smart) + itens que são "ação"
- O header ganha o **botão de menu**, o estado `menuOpen = signal(false)`, e consome
  `HeaderNavService.items()`. Ao `(navigate)`, roteia e fecha; fecha em `NavigationEnd`.
- **Itens `route`** (a maioria do teacher; "Materiais de Apoio" do aluno): navegação direta — funciona
  de qualquer página.
- **Itens `openAction`** (Nova Matrícula; seletores de nível): o header **navega ao dashboard dono**
  passando **query param** (`/teacher-dashboard?open=matricula`, `/student/:id?open=nivel-aulas`); o
  dashboard **lê o query param no init e abre o modal correspondente**. Assim reproduzimos fielmente o
  botão **sem** mover a hospedagem do modal para o header (os modais continuam nas páginas donas).

---

## 5. Decisões & pontos em aberto

> Decisões tomadas para não bloquear a execução (o usuário delegou: qualquer decisão não planejada é
> **destacada no topo da PR**).

- **D1 — Itens de ação via query param (`openAction`).** Em vez de erguer os modais (matrícula,
  seletor de nível) para dentro do header — o que duplicaria estado e contexto — o header **roteia ao
  dashboard dono com `?open=…`** e a página abre o modal. Menor churn, modais permanecem donos do seu
  estado. *Alternativa considerada e adiada:* modais reutilizáveis hospedados no header (mais pesado).
- **D2 — Login/Logout migram para o menu.** O rodapé do painel concentra Login/Logout. O header
  mantém logo + botão de menu; a CTA "Home/BF Academy" atual é **absorvida como item do menu** no
  estado deslogado (evita dois pontos de navegação concorrentes).
- **D3 — Ícone de menu.** Não existe ícone de hambúrguer no `switch-icons`; será **adicionado** um
  `menu` seguindo o padrão dos demais ícones (`app-menu` + case no `switch-icons`). O `close` já existe.
- **D4 — Dashboards não são reescritos nesta spec.** Eles continuam como estão; o `HeaderNavService`
  nasce como fonte do **menu**. Unificar os dashboards para consumir a mesma fonte é **follow-up
  opcional** (evita inchar o diff e o risco).
- **D5 — Nível do aluno.** "Aulas Gravadas" depende do nível, que **não** está no token. Como o fluxo
  atual já resolve isso via **modal seletor de nível**, o item de menu apenas dispara esse modal
  (`openAction`), sem o header precisar conhecer o nível.

---

