
# 5. Estratégia de Versionamento (Git & Branches)

O projeto adotará um modelo baseado no **GitHub Flow simplificado**, focado em agilidade de entrega e rastreabilidade atômica das tarefas.

> **Contexto deste projeto:** dois repositórios — front (`fariasbarbara`, Angular na Vercel) e back (`barbarafarias-api`, NestJS). Cada spec pode tocar um ou os dois. Os PRs são abertos via **GitHub CLI** (`gh`, já autenticado na máquina).

## 5.1. Estrutura de Branches

- **`main`:** branch de **produção**. Só recebe código já validado em staging, via promoção `dev → main`. É o que a Vercel publica em produção — nunca se abre PR de feature/release direto contra ela.
- **`dev`:** branch de **staging/homologação** (integração). É o **alvo de todos os PRs** de feature/release/fix. O dono mescla aqui, **valida em staging** (preview da Vercel), e só então promove para a `main`. Criada a partir da `main`; mantida viva entre specs (normalmente fica alguns commits à frente da `main`, com trabalho já testado ainda não promovido).
- **`feature/nome-da-feature`:** branches temporárias e paralelas onde o desenvolvimento acontece (ex.: `feature/fase1-curriculum-api`, `feature/fase2-prompt-manager`).

> **Por que staging (`dev`):** a `dev` dá uma casa para validar cada spec **antes** de chegar à produção — o dono confere o comportamento no preview antes de promover. Regra de ouro: **PR de trabalho sempre contra `dev`; `main` só via promoção.**

### 5.1.1. Promoção para produção (`dev → main`)

Quando o dono valida em staging o que já foi mesclado na `dev`, promove para produção abrindo um **PR `dev → main`** (ou merge direto, a critério do dono). É o **único** caminho de código para a `main`. A promoção pode agrupar várias specs testadas juntas. Depois da promoção, a `dev` segue a partir da `main` (fast-forward natural, já que a main saiu dela).

## 5.2. Regras de Fluxo (O Ciclo de Vida)

A cadência de trabalho será baseada na especificação de Fases e Tasks do projeto:

- **Criação:** uma nova branch `feature/*` é criada a partir da **`dev`** no início de uma Fase (a `dev` é a base de integração; pode conter trabalho já testado ainda não promovido à `main`).
- **Commits Atômicos (Por Task):** cada Task finalizada gera exatamente um commit. Isso garante que o escopo da alteração no código seja pequeno e isolado.
- **Push em Lote (Por Fase):** o envio (`git push`) para o repositório remoto não acontece a cada commit. Ele é realizado apenas quando todas as tasks de uma Fase inteira forem concluídas na máquina local.
- **Merge:** cada Fase é **pushada** ao fim (branch `feature/faseN-*`), mas **NÃO** gera PR individual. O PR é aberto **uma única vez por spec**, na branch de release (ver 5.2.1). Feature branches servem de histórico granular; o usuário faz o merge pela release.

### 5.2.1. Branch de Release (Fechamento de uma Spec)

Quando **todas as Fases combinadas em uma mesma spec** forem concluídas e pushadas, cria-se uma única **branch de release** que agrega o trabalho inteiro e é a **única a virar PR** (um PR por repo em vez de N por fase).

**Regras da release:**

- **Nomenclatura:** `release/<nome-da-spec>` (ex.: `release/prompt-manager`), criada em **cada repositório** que a spec tocou (be e/ou fe), a partir da **`dev`** (as fases saem da `dev` e são empilhadas entre si).
- **Push das fases:** **cada `feature/faseN-*` é pushada** ao fim de sua fase (rastreabilidade). Só **não abrem PR**.
- **Agregação:** a release **reúne todas as features das tasks da spec**. Como as fases são empilhadas (`faseN` sai de `faseN-1`), o topo (última fase) já contém todas as anteriores — a release nasce desse topo (ou faz `merge` explícito quando forem paralelas).
- **README obrigatório:** **toda branch de release atualiza o `README.md`** (back: estrutura de dados/endpoints; front: produto). É o **único** ponto que toca o README — as fases não mexem nele.
- **PR só da release:** ao final, **abrir o PR da release contra a `dev`** (nunca contra a `main`) via `gh` e entregar a **URL do PR**. **Não** mesclar sem o usuário pedir. A ida para produção é a promoção `dev → main` (§5.1.1), feita pelo dono após validar.

> **Sem página de Novidades/changelog:** este projeto **não** possui página `/novidades` nem arquivo de changelog. Portanto **não há** passo de "adicionar versão nova ao changelog" no fechamento de release/fix — a documentação de produto mora apenas no `README.md` do FE.

### 5.2.1.1. Autonomia de Decisão (não travar o fluxo perguntando)

Especificação nenhuma cobre tudo. Quando o `context.md` for **omisso, ambíguo ou conflitar com o código existente**, **não pare para perguntar**: escolha a solução **mais lógica e segura para o contexto** — a que preserva a arquitetura já estabelecida (back: Controller→Service→Repository; front: Smart×Dumb, ReactiveForms isolado por item), reaproveita o que existe em vez de criar paralelo, e falha de forma conservadora.

- **Critério de decisão:** menor risco > menor divergência do padrão vigente > menor superfície nova de código.
- **Registro obrigatório:** toda decisão tomada **que não estava explícita na spec** vai para uma seção **"Decisões de escopo"** no **topo do corpo do PR** (e, quando houver, no topo do `tasks.md`), dizendo **o que a spec não definia**, **o que foi decidido** e **por quê**.
- **Quando ainda assim perguntar:** só em decisões **irreversíveis ou de produto** (custo/cobrança, exposição pública de dados, remoção de funcionalidade existente). Tudo o mais se decide e se documenta.

### 5.2.2. Correção de Bugs (branch `fix/<nome-bug>`)

Bug encontrado **após** o fechamento/merge da release (ou fora do fluxo de uma spec) **NÃO** se resolve empurrando na branch de release já mergeada — esse commit fica órfão. Toda correção segue seu próprio fluxo:

- **Branch dedicada:** `fix/<nome-bug>` (ex.: `fix/lista-alunos-mobile`), criada a partir da **`dev` atualizada** (`git fetch` antes) — nunca de uma release já mergeada.
- **PR próprio:** cada correção abre seu **próprio PR contra a `dev`** (mesmo `gh`), com corpo descrevendo causa e correção. Entregar a **URL**. **Não** mesclar sem o usuário pedir. (Só um hotfix urgente de produção justificaria um PR direto contra a `main` — e mesmo assim depois se replica na `dev`.)
- **Commit:** prefixo `fix:` (ver 5.3); inclua teste de regressão quando fizer sentido.

### 5.2.3. Sempre testar conflitos contra a branch remota alvo do PR

Antes de considerar um PR (fix ou release) pronto — **e sempre que a base avançar** (outro PR foi mergeado enquanto o seu estava aberto) — **teste o merge contra a branch remota que o PR mira** (`dev`), não só contra a base local:

- **Como testar:** `git fetch origin` e então simular o merge da alvo na sua branch: `git merge origin/dev` (ou `git merge --no-commit --no-ff origin/dev` para inspecionar sem fechar). Se acusar `CONFLICT`, **resolver na hora**, buildar/testar, commitar o merge e dar `push` — o PR sai de `CONFLICTING` para `MERGEABLE` sem precisar reabrir.
- **Ponto quente recorrente:** o `README.md` (todo PR de release o toca). Ao resolver, **manter as duas contribuições** — reconciliar as seções de cada spec em vez de sobrescrever.
- **Regra geral:** o estado de merge do PR é sempre calculado contra o **topo atual da remota**; não confie no fato de que a branch "saiu limpa da `dev`" no momento da criação — revalide antes de entregar/pedir merge.

## 5.3. Convenção de Nomenclatura de Commits

Para manter o log legível e padronizado (o que facilita para você e para o agente de IA lerem o histórico depois), utilizaremos um padrão semântico simples atrelado ao número da task:

- **`feat:`** para novas funcionalidades.
- **`fix:`** para correções de bugs.
- **`chore:`** para configurações, setup ou tarefas que não afetam código de produção.
- **`refactor:`** para refatoração de código existente.
- **`test:`** para adição/ajuste de testes.
- **`docs:`** para documentação (ex.: o `README.md` da release).

**Exemplo Prático (Executando a Fase 1 de Infra do Backend):**

```bash
# 1. Inicia a Fase 1 (a partir da dev)
git checkout dev && git pull
git checkout -b feature/fase1-infra-backend

# (Escreve o código da Task 1: Setup do Nest)
git add .
git commit -m "chore: inicializa projeto nest e configura variaveis de ambiente (Task 1)"

# (Escreve o código da Task 2: Firebase Module)
git add .
git commit -m "feat: cria FirebaseModule e injeta o admin sdk (Task 2)"

# (Escreve o código da Task 3: AuthGuard)
git add .
git commit -m "feat: implementa AuthGuard global para validacao de token (Task 3)"

# 2. Fase 1 concluída. Faz o push de tudo para o remote de uma vez.
git push origin feature/fase1-infra-backend
```

## 5.4. Deploy

O deploy é feito pela **Vercel** em ambos os repositórios:

- **`main` → produção**; **`dev` → preview/staging** (é onde o dono valida cada spec antes de promover).
- O deploy acompanha o merge nas branches — não há passos manuais de publicação fora da Vercel.
- **Sem deploy de Firestore Rules:** este projeto **não** publica `firestore.rules`. O cliente (front) não acessa o Firestore diretamente — fala com a **API NestJS**, que usa o **Admin SDK** (ignora as rules). Logo, alterações de dados não exigem nenhum passo separado de deploy de regras. (`firebase.json` no FE cobre apenas hosting estático.)
