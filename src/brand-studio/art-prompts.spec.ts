import { buildPlanPrompt, buildSlidePrompt } from './art-prompts';
import { ArtPlan } from './artwork.model';

const identity = '# Identidade de teste\nRoxo #271c29 e dourado #dcac44.';

const plan: ArtPlan = {
  title: 'Phrasal verbs do dia a dia',
  variant: 'claro',
  slides: [
    {
      headline: '5 phrasal verbs',
      body: 'Que você usa todo dia',
      visual: 'capa',
    },
    { headline: 'Give up', body: 'Desistir', visual: 'exemplo' },
    { headline: 'Salve este post', body: '', visual: 'fechamento' },
  ],
};

/** Posição de cada seção no prompt, para conferir a ordem das camadas. */
function positions(prompt: string, markers: string[]) {
  return markers.map((m) => {
    const at = prompt.indexOf(m);
    expect(at).toBeGreaterThanOrEqual(0);
    return at;
  });
}

describe('buildPlanPrompt (roteiro)', () => {
  const prompt = buildPlanPrompt({
    prompt: 'Carrossel ensinando phrasal verbs',
    format: 'carousel',
    slideCount: 3,
    identity,
    photoCount: 1,
  });

  it('monta as camadas na ordem: papel, identidade, pedido, saída', () => {
    const at = positions(prompt, [
      '# PAPEL',
      '# IDENTIDADE',
      '# PEDIDO',
      '# SAÍDA',
    ]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('leva a identidade inteira, o pedido e o número exato de slides', () => {
    expect(prompt).toContain(identity);
    expect(prompt).toContain('Carrossel ensinando phrasal verbs');
    expect(prompt).toContain('exatamente 3 slides');
  });

  it('pede o JSON do roteiro com a variação de fundo', () => {
    expect(prompt).toContain('"variant"');
    expect(prompt).toContain('"slides"');
  });

  it('avisa quantas fotos a gerente anexou', () => {
    expect(prompt).toContain('1 foto');
  });
});

describe('buildSlidePrompt (HTML de um slide)', () => {
  const base = {
    prompt: 'Carrossel ensinando phrasal verbs',
    format: 'story' as const,
    identity,
    plan,
    index: 1,
    photoCount: 2,
  };

  it('monta as camadas na ordem: papel, identidade, contrato, pedido, saída', () => {
    const at = positions(buildSlidePrompt(base), [
      '# PAPEL',
      '# IDENTIDADE',
      '# CONTRATO TÉCNICO',
      '# PEDIDO',
      '# SAÍDA',
    ]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('o contrato técnico traz o canvas exato do formato', () => {
    expect(buildSlidePrompt(base)).toContain('1080px × 1920px');
    expect(buildSlidePrompt({ ...base, format: 'post' })).toContain(
      '1080px × 1440px',
    );
    expect(buildSlidePrompt({ ...base, format: 'carousel' })).toContain(
      '1080px × 1080px',
    );
  });

  it('o contrato proíbe script, eventos e recursos externos e define os marcadores', () => {
    const prompt = buildSlidePrompt(base);
    for (const regra of [
      '<script>',
      'on*',
      '<bf-logo',
      'data-photo',
      'Outfit',
      'Inter',
    ]) {
      expect(prompt).toContain(regra);
    }
  });

  it('o story reserva as faixas da interface do Instagram', () => {
    expect(buildSlidePrompt(base)).toContain('220px');
  });

  it('leva o roteiro inteiro e diz qual slide gerar', () => {
    const prompt = buildSlidePrompt(base);
    expect(prompt).toContain('Give up');
    expect(prompt).toContain('Salve este post');
    expect(prompt).toContain('slide 2 de 3');
    expect(prompt).toContain('variação "claro"');
  });

  it('só oferece as fotos que existem', () => {
    expect(buildSlidePrompt(base)).toContain('data-photo="2"');
    expect(buildSlidePrompt({ ...base, photoCount: 0 })).toContain(
      'Não há fotos',
    );
  });

  it('ao refazer, inclui o ajuste pedido e o HTML anterior', () => {
    const prompt = buildSlidePrompt({
      ...base,
      note: 'título maior',
      previousHtml: '<div>versão antiga</div>',
    });
    expect(prompt).toContain('título maior');
    expect(prompt).toContain('<div>versão antiga</div>');
  });

  it('a identidade customizada entra no lugar da salva, sem misturar', () => {
    const custom = 'Neon verde sobre preto.';
    const prompt = buildSlidePrompt({ ...base, identity: custom });
    expect(prompt).toContain(custom);
    expect(prompt).not.toContain('#dcac44');
  });
});
