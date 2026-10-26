import { ART_FORMATS, ArtFormat, ArtPlan } from './artwork.model';

/**
 * Prompts da Campanha (spec 031 §3), montados em camadas no padrão do
 * `curriculum`: papel → identidade → contrato técnico → pedido → saída.
 *
 * A identidade é texto da gerente (salva ou descrita na hora). O contrato
 * técnico é fixo e não editável: é ele que garante um HTML que o front
 * consegue renderizar em PNG, e que o sanitizador não vai mutilar.
 */

const ROLE = `# PAPEL
Você é designer de social media da escola de inglês Bárbara Farias. Cria peças para Instagram que
param o scroll, comunicam uma ideia por slide e seguem à risca a identidade visual abaixo.`;

function identityLayer(identity: string): string {
  return `# IDENTIDADE
Siga esta identidade visual. Quando ela conflitar com o seu gosto, vence a identidade.

${identity.trim()}`;
}

function formatLine(format: ArtFormat): string {
  const f = ART_FORMATS[format];
  return `${f.label} (${f.ratio}), canvas de ${f.width}px × ${f.height}px`;
}

function photosLine(photoCount: number): string {
  if (photoCount === 0)
    return 'Não há fotos anexadas: a peça é só tipografia, formas e o logo.';
  const markers = Array.from(
    { length: photoCount },
    (_, i) => `<img data-photo="${i + 1}">`,
  ).join(', ');
  return `A gerente anexou ${photoCount} foto${photoCount > 1 ? 's' : ''}. Para usar, escreva ${markers} (sem src; o sistema preenche). Use cada foto no máximo uma vez por slide.`;
}

function technicalContract(format: ArtFormat, photoCount: number): string {
  const { width, height } = ART_FORMATS[format];
  const safe =
    format === 'story'
      ? 'Margem de segurança de 64px nas laterais e de 220px no topo e no rodapé (a interface do Instagram cobre essas faixas): nenhum texto ou logo nelas.'
      : 'Margem de segurança de 64px em todos os lados: nenhum texto ou logo encostado na borda.';
  return `# CONTRATO TÉCNICO
O HTML será renderizado como imagem PNG. Regras obrigatórias:
1. Um único <div> raiz com width: ${width}px; height: ${height}px; overflow: hidden; position: relative; box-sizing: border-box (o padding fica DENTRO dos ${width}px). Tudo dentro dele — este é o canvas de ${width}px × ${height}px.
2. CSS inline (atributo style) ou num único <style> dentro do div raiz. Use px; layout com flexbox, grid ou position absolute.
3. Proibido: <script>, atributos on* (onclick etc.), <iframe>, <form>, <link>, <object>, @import, url() e qualquer recurso externo. Fundos e formas só com cores, gradientes CSS e SVG inline.
4. Fontes: só font-family "Outfit" (títulos) e "Inter" (texto). Já estão carregadas.
5. Logo da marca: escreva <bf-logo variant="light"></bf-logo> sobre fundo escuro ou <bf-logo variant="dark"></bf-logo> sobre fundo claro, com width e height no style (entre 64px e 160px). O sistema troca pelo SVG oficial.
6. ${photosLine(photoCount)}
7. ${safe}
8. Tamanhos mínimos no canvas: título ≥ 72px, texto ≥ 32px. Contraste de leitura AA entre texto e fundo.
9. Não use backdrop-filter, mix-blend-mode, filter: blur nem animações: não aparecem no PNG.`;
}

const PLAN_OUTPUT = `# SAÍDA
Responda só com JSON válido, sem comentários:
{
  "title": "nome curto da peça",
  "variant": "profundo" ou "claro" (a variação de fundo da identidade; use outra palavra só se a identidade definir outras),
  "slides": [
    { "headline": "título do slide", "body": "texto de apoio curto (pode ser vazio)", "visual": "descrição da composição: elementos, posição, destaque" }
  ]
}`;

const SLIDE_OUTPUT = `# SAÍDA
Responda só com JSON válido: { "html": "<div ...>...</div>" }`;

export interface PlanPromptInput {
  prompt: string;
  format: ArtFormat;
  slideCount: number;
  identity: string;
  photoCount: number;
}

/** Primeira etapa: o roteiro da peça inteira, curto e rápido. */
export function buildPlanPrompt(input: PlanPromptInput): string {
  const sequence =
    input.format === 'carousel'
      ? 'O carrossel tem capa (gancho forte), desenvolvimento (uma ideia por slide) e fechamento (chamada para ação: salvar, compartilhar ou falar com a escola).'
      : 'É uma peça única: uma mensagem central, direta.';
  return [
    ROLE,
    identityLayer(input.identity),
    `# PEDIDO
Formato: ${formatLine(input.format)}.
Crie o roteiro com exatamente ${input.slideCount} slide${input.slideCount > 1 ? 's' : ''}. ${sequence}
${input.photoCount > 0 ? `A gerente anexou ${input.photoCount} foto${input.photoCount > 1 ? 's' : ''}; distribua o uso no campo "visual".` : 'Não há fotos anexadas.'}
Pedido da gerente:
"""
${input.prompt.trim()}
"""`,
    PLAN_OUTPUT,
  ].join('\n\n');
}

export interface SlidePromptInput {
  prompt: string;
  format: ArtFormat;
  identity: string;
  plan: ArtPlan;
  /** Índice do slide, começando em 0. */
  index: number;
  photoCount: number;
  /** Ajuste pedido ao refazer. */
  note?: string;
  /** O HTML que está sendo refeito. */
  previousHtml?: string | null;
}

/** Segunda etapa: o HTML de um slide, com o roteiro inteiro para manter a coerência. */
export function buildSlidePrompt(input: SlidePromptInput): string {
  const total = input.plan.slides.length;
  const slide = input.plan.slides[input.index];
  const roteiro = input.plan.slides
    .map(
      (s, i) =>
        `${i + 1}. ${s.headline}${s.body ? ` — ${s.body}` : ''}${s.visual ? ` [${s.visual}]` : ''}`,
    )
    .join('\n');
  const redo =
    input.note || input.previousHtml
      ? `\nEste slide está sendo refeito.${input.note ? ` Ajuste pedido pela gerente: "${input.note.trim()}".` : ''}${input.previousHtml ? `\nVersão anterior (mantenha o que não foi pedido para mudar):\n${input.previousHtml}` : ''}`
      : '';
  return [
    ROLE,
    identityLayer(input.identity),
    technicalContract(input.format, input.photoCount),
    `# PEDIDO
Peça: "${input.plan.title}" — ${formatLine(input.format)}, variação "${input.plan.variant}".
Pedido original da gerente:
"""
${input.prompt.trim()}
"""
Roteiro completo (para manter a mesma linguagem visual em todos os slides):
${roteiro}

Gere agora o slide ${input.index + 1} de ${total}: "${slide.headline}".${slide.body ? `\nTexto de apoio: ${slide.body}` : ''}${slide.visual ? `\nComposição: ${slide.visual}` : ''}${total > 1 ? `\nMostre a posição no carrossel de forma discreta (${input.index + 1}/${total} ou pontos).` : ''}${redo}`,
    SLIDE_OUTPUT,
  ].join('\n\n');
}
