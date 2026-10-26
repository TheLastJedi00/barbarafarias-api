/**
 * Identidade de arte padrão da Campanha (spec 031).
 *
 * Derivada de `.claude/specs/styles/identidade-visual.md` (a identidade da
 * plataforma depois da padronização), mas reescrita para peça de rede social:
 * a plataforma tem tema claro e escuro, uma arte não — ela tem duas variações
 * de fundo, e a IA escolhe pelo assunto.
 *
 * É o texto que o seed preguiçoso grava na primeira leitura e o que o
 * "Restaurar original" devolve. Depois disso a gerente pode editá-lo no banco;
 * mudar este arquivo não altera a padrão já gravada.
 */
export const DEFAULT_IDENTITY_NAME = 'Bárbara Farias (padrão)';

export const DEFAULT_IDENTITY_CONTENT = `# Identidade visual — Bárbara Farias

Escola de inglês da professora Bárbara Farias. A marca é acolhedora e confiante: elegante sem ser
fria, próxima sem ser infantil. Roxo profundo é a base; dourado é o destaque.

## Paleta

| Papel | Cor |
|---|---|
| Roxo profundo (base escura) | #271c29 |
| Roxo noite (fundo mais escuro) | #1a121c |
| Roxo médio | #503357 |
| Roxo suave | #9b7fa0 |
| Lavanda (fundo claro) | #f8f5f9 |
| Lavanda 2 (superfície clara) | #eee7ef |
| Dourado | #dcac44 |
| Dourado claro | #eeddba |
| Dourado escuro (texto dourado sobre fundo claro) | #a87c21 |

Gradientes da marca:

- **Assinatura:** #503357 → #a87c21 (sobre fundo claro) ou #9b7fa0 → #dcac44 (sobre fundo escuro).
- **Dourado:** #dcac44 → #eeddba. É o gradiente dos botões e destaques; texto sobre ele é #271c29.
- **Halos de fundo:** manchas radiais suaves de #bca6c0 e #eeddba, com transparência, nos cantos.

Não use outras cores de destaque (vermelho, azul, verde, neon). Preto puro e branco puro só em
detalhes mínimos.

## Variações de fundo

- **Profundo** (padrão para anúncios, citações, convites): fundo #1a121c ou gradiente #271c29 →
  #3a2a3d; títulos em gradiente dourado ou #f8f5f9; texto de apoio #d9ccdc; detalhes em #dcac44.
- **Claro** (dicas, listas, conteúdo educativo): fundo #f8f5f9 com halos lavanda e dourado; títulos
  em #271c29 ou no gradiente de assinatura; texto de apoio #634768; detalhes em #a87c21.

Escolha pela mensagem quando o pedido não disser qual. Num carrossel, use a mesma variação em todos
os slides (pode alternar só no slide de capa ou no de fechamento).

## Tipografia

- **Títulos:** Outfit, peso 700–800, entrelinha 1.05–1.15, espaçamento entre letras -0.02em.
- **Texto:** Inter, peso 400–600, entrelinha 1.4.
- Destaque de uma ou duas palavras do título em dourado (ou no gradiente dourado), nunca a frase
  inteira.
- Palavras e frases em inglês podem aparecer em itálico ou num selo, para marcar o idioma estudado.

## Elementos

- **Logo:** monograma BF da marca. Use-o pequeno, num canto ou centralizado no rodapé, com área de
  respiro. Na variação Profunda, logo claro; na Clara, logo escuro.
- **Formas:** cantos arredondados (24–48px), pílulas para selos e chamadas, linhas finas douradas
  como divisórias, círculos e arcos suaves. Nada de formas agressivas, sombras pesadas ou texturas.
- **Fotos:** quando houver, recorte com cantos arredondados ou em círculo, com borda fina dourada ou
  um véu roxo translúcido (#271c29 a 40–60%) quando houver texto por cima.
- **Chamada para ação:** pílula com o gradiente dourado e texto #271c29 em peso 700.

## Tom de voz

Português do Brasil, frases curtas, segunda pessoa ("você"). Motivador e prático: o aluno sente que
consegue. Pode misturar expressões curtas em inglês com a tradução ao lado.

## Evitar

- Mais de três tamanhos de texto na mesma peça.
- Texto corrido longo: no máximo 40 palavras por slide.
- Emojis em excesso (no máximo um, como detalhe).
- Clichês de banco de imagens: bandeiras, Big Ben, estátua da liberdade.
`;
