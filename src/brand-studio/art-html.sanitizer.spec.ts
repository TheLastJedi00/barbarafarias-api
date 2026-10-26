import { sanitizeArtHtml } from './art-html.sanitizer';

/**
 * O HTML vem da IA e vai ser renderizado no navegador da gerente: o que não
 * é desenho sai aqui, antes de gravar. O front sanitiza de novo ao exibir.
 */
describe('sanitizeArtHtml', () => {
  it('remove script, iframe, form, link e object', () => {
    const html = sanitizeArtHtml(
      '<div><script>alert(1)</script><iframe src="x"></iframe><form></form><link rel="stylesheet" href="x"><object data="x"></object><p>ok</p></div>',
    );
    expect(html).not.toMatch(/script|iframe|form|link|object|alert/);
    expect(html).toContain('<p>ok</p>');
  });

  it('remove atributos de evento e javascript:', () => {
    const html = sanitizeArtHtml(
      '<div onclick="x()" onmouseover="y()"><a href="javascript:alert(1)">a</a><svg onload="z()"></svg></div>',
    );
    expect(html).not.toMatch(/on(click|mouseover|load)|javascript|<a/);
  });

  it('tira url() e @import do CSS, inline e no <style>', () => {
    const html = sanitizeArtHtml(
      '<div style="background: url(https://x.com/a.png) #fff; color: red"><style>@import "https://x.com/a.css"; .a { background-image: url(\'//x.com/b.png\'); color: #271c29 }</style></div>',
    );
    expect(html).not.toMatch(/url\(|@import|x\.com/);
    expect(html).toContain('color: red');
    expect(html).toContain('color: #271c29');
  });

  it('img só sobrevive como marcador de foto, sem src', () => {
    const html = sanitizeArtHtml(
      '<div><img data-photo="1" src="https://x.com/a.png" style="width: 200px"><img src="https://x.com/b.png"></div>',
    );
    expect(html).toContain('data-photo="1"');
    expect(html).toContain('width: 200px');
    expect(html).not.toContain('x.com');
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it('mantém o marcador do logo com a variante', () => {
    const html = sanitizeArtHtml(
      '<div><bf-logo variant="light" style="width: 96px; height: 96px" onclick="x"></bf-logo></div>',
    );
    expect(html).toContain('<bf-logo variant="light"');
    expect(html).toContain('width: 96px');
    expect(html).not.toContain('onclick');
  });

  it('mantém SVG inline com gradiente', () => {
    const svg =
      '<svg viewBox="0 0 10 10" width="100" height="100"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#dcac44"></stop></linearGradient></defs><path d="M0 0L10 10" stroke="#dcac44" stroke-width="2" fill="url(#g)"></path><circle cx="5" cy="5" r="2"></circle></svg>';
    const html = sanitizeArtHtml(`<div>${svg}</div>`);
    expect(html).toContain('linearGradient');
    expect(html).toContain('stop-color="#dcac44"');
    expect(html).toContain('d="M0 0L10 10"');
    expect(html).toContain('<circle');
  });

  it('referência interna do SVG (url(#id)) continua; externa não', () => {
    const html = sanitizeArtHtml(
      '<svg><rect fill="url(#g)"></rect><rect fill="url(https://x.com/a)"></rect></svg>',
    );
    expect(html).toContain('fill="url(#g)"');
    expect(html).not.toContain('x.com');
  });

  it('use e image do SVG, que puxam recurso, saem', () => {
    const html = sanitizeArtHtml(
      '<svg><use href="https://x.com/s.svg#a"></use><image href="https://x.com/a.png"></image></svg>',
    );
    expect(html).not.toMatch(/<use|<image|x\.com/);
  });
});
