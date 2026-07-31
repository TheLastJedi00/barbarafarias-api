# Spec 004 — UX & Refatoração de Formulários (Frontend `fariasbarbara`)

> **Objetivo macro:** **refazer do zero** os formulários que estão **emaranhados — visual e
> logicamente** — com foco **total em UX**, seguindo diretrizes modernas de UI/UX. O epicentro é o
> **video-manager** (forms aninhados em accordions + o pai reconstruindo o objeto inteiro a cada
> micro-edição), mas a spec cobre todos os forms com dívida de UX: edição de aluno, "Nova Matrícula",
> turma-manager e os campos sem feedback de validação espalhados pelo app.
>
> **Direito total** de recriar os forms do zero. Não é reskin (isso foi a Spec 003) — é **repensar a
> interação e a arquitetura de estado** dos formulários. Preservar apenas o contrato com o backend
> (endpoints existentes) e a linguagem visual glass/gold já consolidada.
>
> **Princípio norteador:** um formulário deve ser **previsível, isolado e conversacional** — dizer ao
> usuário o que fazer, validar de forma clara e nunca "travar o botão sem explicar". Padronizar em
> **ReactiveForms + componentes de campo atômicos**; smart pages orquestram HTTP, dumb components
> apenas emitem. Simplicidade acima de abstração.

- **Repositório:** `fariasbarbara` (`github.com/TheLastJedi00/fariasbarbara`)
- **Stack:** Angular 20 (standalone, zoneless, signals), ReactiveForms, Tailwind CSS v4
- **Data de abertura:** 2026-07-06
- **Fluxo:** [github-flow.md](../github-flow.md) — fases empilhadas, 1 commit por task, push por fase, **1 único PR** na release.
- **Base das branches:** a partir do topo do trabalho integrado — a `main` **após** o restore da
  Spec 003 (PR #14) ser mesclado. Enquanto o #14 estiver pendente, empilhar a partir de
  `fix/restaura-polimento-profundo` (= `main` + Spec 003). A Spec 004 depende do reskin da 003
  (os forms já estão em glass; aqui recriamos a lógica/UX por baixo).
- **Escopo:** **somente frontend.** O upsert de módulo inteiro (`saveNewVideoModule`) é uma
  restrição do backend — a 004 **contorna no FE** (ids estáveis, estado local, loading por item),
  sem tocar na `barbarafarias-api`. Uma API granular de vídeos, se desejada, é spec de backend à parte.

---

## 1. Diagnóstico — o emaranhado atual

Agrupado por gravidade (base para priorização).

### 1.1 CRÍTICO
**`pages/video-manager` (`.ts` + `.html`) — o núcleo.**
| # | Problema |
|---|----------|
| V1 | O **pai reconstrói o `VideoModule` inteiro** a cada micro-edição (`saveTopicChanges`, `addVideoToTopic`, `addTopicToModule`, `saveVideoChanges`, `deleteVideoFromTopic`). Editar 1 título reenvia todos os tópicos/vídeos do módulo. |
| V2 | **Identidade por `title` (string mutável)** como chave (`t.title === topic.title`). Renomear tópico ou títulos repetidos quebram o match silenciosamente. Estado de UI (`toggledTopicTitle`) keyed por título, precisa de 2 chaves p/ não vazar. |
| V3 | **Casamento de vídeo inconsistente:** `saveVideoChanges` acha por **referência** (`v === original`); `deleteVideoFromTopic` por **`youtubeId`**. Dois critérios de identidade para a mesma entidade. |
| V4 | **`isLoading` é um único signal global** — salvar 1 vídeo desabilita todos os botões de todos os módulos/tópicos/vídeos abertos. |
| V5 | **Refetch total no `finally`** de toda operação (`searchVideosByLevel()`), inclusive quando falhou. |

**`components/video-item` — o pior form.** Usa **`#template refs`** (`#titleRef`,`#orderRef`,`#ytRef`) em vez de `FormControl`; **zero validação** (aceita título vazio, ordem `NaN`, youtubeId inválido); sem dirty-tracking, sem feedback de campo. Único form de conteúdo sem ReactiveForms.

**`pages/students` — edição inline.** Um **único `FormGroup` compartilhado por todas as linhas** do `@for`; `isLoading/isSuccess/errorMessage` são signals globais da página (conceitualmente da linha); `info()`/`edit()` se pisam via toggles acoplados; `isSuccess` some por `setTimeout(3000)`.

### 1.2 MÉDIO
- **`components/topic-editor`**: `effect()` faz `patchValue` a cada CD → risco de sobrescrever edição não salva (o pai reemite o objeto após cada save). Campo "descrição" **duplicado** (um `<textarea disabled>` de leitura + um editável). Salvar é `(click)` em `type="button"`, não `ngSubmit`.
- **`shared/form/registration-form`**: `isPaying` com **dupla fonte de verdade** (signal + FormControl, dessincronizados); **senha em `type="text"`** (visível); erros de validação quase nunca aparecem (botão já desabilitado antes de tocar os campos); sem máscara de telefone.
- **`components/turma-manager`**: **não usa ReactiveForms** (signals + `(input)` não-controlado); **não reseta estado ao fechar/reabrir o modal** — `name`/`selectedIds`/`editingId` vazam entre aberturas.

### 1.3 OK (padrão bom — só falta validação inline)
- `create-module-form`, `add-topic-form`, `add-video-form` (dumb + Validators + `reset()` — **modelo a seguir**), `pages/login`, `agenda.ts`, `occupant-selector`, `student-multi-select`. Ressalva comum: **"só desabilita o botão"**, sem dizer ao usuário o porquê. `occupant-selector`/`student-multi-select` não resetam a busca ao reabrir.

### 1.4 Padrões transversais (o que a spec ataca)
1. **"Só desabilita o botão"** em quase todo form → falta feedback de validação inline.
2. **Identidade por string mutável** (`title`) → precisa de id estável.
3. **Estado global de loading/feedback** grosso demais → deveria ser **por item/operação** nas listas.
4. **Estado de modal que não reseta** ao reabrir (turma-manager, selectors).
5. **Mistura de estratégias** (ReactiveForms / signals+`(input)` / `#refs`) → padronizar em ReactiveForms isolado por item.

---

## 2. Diretrizes de UI/UX modernas (alvo)

> Na execução, consultar a skill **`frontend-design`** para direção visual dos campos. Estas são as
> regras funcionais e de interação que todo form da 004 deve cumprir:

**Arquitetura**
- **1 form = 1 `FormGroup` tipado**, isolado por instância. Em listas, **um FormGroup por item** (nada de form único compartilhado). Modais **resetam** ao abrir E ao fechar.
- **Dumb forms** recebem valor inicial via `input()` e emitem o payload via `output()`; a **smart page** faz HTTP. Sem HTTP dentro de componente de form.
- **Identidade estável**: entidades referenciadas por **id imutável**, nunca por label editável.

**Validação & feedback**
- **Validação inline** por campo, exibida **on-blur + on-submit** (não só quando o botão trava). Mensagem **ligada ao campo** (`aria-describedby`), específica ("E-mail inválido", não "campo inválido").
- No submit inválido: **focar o primeiro campo com erro**. Botão de submit pode ficar desabilitado, **mas nunca é a única sinalização**.
- **Máquina de estados** consistente por form: `idle → editando → validando → enviando → sucesso | erro`. Loading **por operação/linha**, não global.
- **Estados de sucesso/erro** claros e não-efêmeros por acidente (evitar `setTimeout` como única forma de limpar).

**Interação & carga cognitiva**
- **Reduzir aninhamento**: nada de forms empilhados em accordions dentro de loops. Preferir **modais/steppers** com um foco por vez (ex.: video-manager vira fluxo Módulo → Tópico → Vídeo).
- **Tipos de input inteligentes**: `type`/`inputmode`/`autocomplete` corretos; **senha mascarada** com toggle de revelar; **máscara** de telefone e validação de formato do `youtubeId`.
- **Confirmações destrutivas** (já há `confirm-modal`); **atualização otimista** de estado local onde for seguro (sem refetch total).
- **Affordances claras**: labels sempre visíveis, hints curtos, botão primário único e rotulado pela ação ("Salvar vídeo", não "Enviar").

**Acessibilidade & responsivo**
- `<label for>` associado, `aria-invalid`, `aria-describedby`, ordem de tabulação lógica, alvos de toque ≥44px, teclado 100% operável. Consistência visual glass/gold da Spec 003.

---

## 3. Estrutura-alvo (`src/app/shared/form/`)

Design system de formulário — os **campos atômicos** que a Spec 001 adiou e que agora são a base:

```
shared/form/
  fields/
    text-field         input text/email/password (password com toggle de revelar) — label, hint, erro inline, a11y
    textarea-field     textarea com contador opcional
    select-field       select nativo estilizado (options legíveis no glass)
    number-field       input numérico com min/max e passo
    toggle-field       switch on/off (isPaying etc.) — fonte única de verdade
  form-actions         botões primário/secundário com estado de loading/disabled padronizado
  form-error           helper de mensagem de erro por controle (lê ValidationErrors → texto PT-BR)
  registration-form    (refeito sobre os fields acima)
```
Cada field é **dumb, OnPush, ControlValueAccessor OU recebe o `FormControl` via `input()`** (decidir na Fase 1 — preferir receber o `FormControl`, mais simples que CVA e suficiente aqui). Emite nada além do próprio binding; o erro é derivado do control (`touched && invalid`).

---


## 5. Decisões & observações

- **Só frontend.** O endpoint `saveNewVideoModule` (upsert de módulo inteiro) permanece; a melhoria
  é computar o módulo atualizado de forma limpa (ids estáveis) e atualizar o estado local sem refetch.
  API granular de vídeos = spec de backend futura, fora daqui.
- **Não é reskin.** A Spec 003 já deixou os forms em glass; a 004 mexe na **lógica/UX/estado**.
  Onde o markup mudar, mantém-se a linguagem visual da 003.
- **Campos recebem `FormControl` via `input()`** (preferência) em vez de `ControlValueAccessor` —
  menos cerimônia, mesmo ganho. Reavaliar na Fase 1 se algum caso exigir CVA.
- **`create/add-*-form` são a referência** de bom padrão; os novos fields devem manter esse nível e
  só adicionar o que falta (erro inline).
- **Tasks podem ser foldadas** com registro (como nas specs anteriores) se uma melhoria não agregar.

---

## 6. Progresso

| Fase | Branch | Status |
|------|--------|--------|
| 1 — Form fields (design system) | `feature/fase1-form-fields` | ✅ Concluída e pushada |
| 2 — Video-manager (reconstrução) | `feature/fase2-video-manager` | ✅ Concluída e pushada |
| 3 — Edição de aluno | `feature/fase3-students` | ✅ Concluída e pushada |
| 4 — Matrícula/turmas/demais | `feature/fase4-forms-restantes` | ✅ Concluída e pushada |
| 5 — Polimento UX & a11y | `feature/fase5-polish-ux` | ✅ Concluída e pushada |
| Release | `release/ux-formularios` | ✅ **PR #15 aberto** → https://github.com/TheLastJedi00/fariasbarbara/pull/15 |

> **Base:** empilhada a partir de `fix/restaura-polimento-profundo` (= main + Spec 003). Build `ng build`
> verde e **sem warnings** ao fim de cada fase.
>
> **Tasks foldadas (registradas acima):** F1 sem folds; F2 consolidou 6 tasks→3 e 5 forms→3;
> F5 Task 2 (transições/touch) — já consistente por construção.
