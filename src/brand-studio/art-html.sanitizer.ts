import sanitizeHtml from 'sanitize-html';

/**
 * Sanitização do HTML que a IA da Campanha devolve (spec 031 §3).
 *
 * Allowlist, não blocklist: só passa o que é desenho — texto, caixas, SVG
 * inline, o marcador do logo e o das fotos. Nada que execute (script, on*) e
 * nada que busque recurso fora (src, href, url() externa, @import): a arte é
 * autocontida, e o front só preenche os marcadores com o que é da escola.
 *
 * O front sanitiza de novo antes de exibir; a defesa fica dos dois lados.
 */

const TEXT_TAGS = [
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'small',
  'sup',
  'sub',
  'br',
  'hr',
  'ul',
  'ol',
  'li',
  'blockquote',
  'section',
  'header',
  'footer',
  'figure',
  'figcaption',
];

/** SVG desenhado; `use` e `image`, que carregam recurso, ficam de fora. */
const SVG_TAGS = [
  'svg',
  'g',
  'defs',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
];

const SVG_ATTRIBUTES = [
  'viewBox',
  'xmlns',
  'width',
  'height',
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'fx',
  'fy',
  'points',
  'transform',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'patternUnits',
  'preserveAspectRatio',
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'clip-path',
  'mask',
];

/**
 * Tira do CSS o que busca recurso fora. `url(#id)` fica: é referência a um
 * gradiente ou máscara do próprio SVG, não sai da página.
 */
export function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(');
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...TEXT_TAGS, ...SVG_TAGS, 'img', 'style', 'bf-logo'],
  allowedAttributes: {
    '*': ['style', 'class', 'id'],
    img: ['data-photo', 'alt', 'width', 'height'],
    'bf-logo': ['variant'],
    ...Object.fromEntries(SVG_TAGS.map((tag) => [tag, SVG_ATTRIBUTES])),
  },
  allowedSchemes: [],
  // `<style>` é permitido de propósito: o CSS passa pelo `cleanCss` abaixo.
  allowVulnerableTags: true,
  // O `style` passa inteiro pelo `cleanCss`; sem isto a lib o reescreveria.
  parseStyleAttributes: false,
  // SVG diferencia maiúsculas (`linearGradient`, `viewBox`).
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  // Foto sem o marcador não tem como receber a imagem da escola: sai.
  exclusiveFilter: (frame) =>
    frame.tag === 'img' && !/^\d+$/.test(frame.attribs['data-photo'] ?? ''),
  transformTags: {
    '*': (tagName, attribs) => ({
      tagName,
      attribs: Object.fromEntries(
        Object.entries(attribs).map(([name, value]) => [name, cleanCss(value)]),
      ),
    }),
  },
};

/** O conteúdo de `<style>` não passa pelos filtros de texto da lib: limpo antes e depois. */
function cleanStyleBlocks(html: string): string {
  return html.replace(
    /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_, open: string, css: string, close: string) =>
      open + cleanCss(css) + close,
  );
}

export function sanitizeArtHtml(html: string): string {
  return cleanStyleBlocks(sanitizeHtml(cleanStyleBlocks(html), OPTIONS)).trim();
}
