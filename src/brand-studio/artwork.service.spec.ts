import {
  BadRequestException,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { ArtworkService } from './artwork.service';
import { ArtPlan, Artwork } from './artwork.model';
import { BrandIdentity } from './brand-identity.model';

const manager = { sub: 'manager-1', email: 'm@x', role: 'manager' as const };

const padrao: BrandIdentity = {
  id: 'default',
  name: 'Bárbara Farias (padrão)',
  isDefault: true,
  content: 'IDENTIDADE PADRÃO roxo e dourado',
  createdBy: 'system',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

function planOf(count: number): ArtPlan {
  return {
    title: 'Phrasal verbs',
    variant: 'claro',
    slides: Array.from({ length: count }, (_, i) => ({
      headline: `Slide ${i + 1}`,
      body: '',
      visual: '',
    })),
  };
}

function photo(name = 'a') {
  const path = `artworks/${name}.jpg`;
  return {
    url: `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(path)}?alt=media&token=t`,
    path,
  };
}

function makeService(
  options: { plan?: ArtPlan; html?: string; stored?: Artwork[] } = {},
) {
  const docs = new Map((options.stored ?? []).map((a) => [a.id, a]));
  const repository = {
    docs,
    create: jest.fn(async (data: Omit<Artwork, 'id'>) => {
      const created = { ...data, id: `art-${docs.size + 1}` };
      docs.set(created.id, created);
      return created;
    }),
    get: jest.fn(async (id: string) => docs.get(id) ?? null),
    // Como a transação real: aplica sobre a versão gravada no momento.
    update: jest.fn(async (id: string, mutate: (a: Artwork) => Artwork) => {
      const current = docs.get(id);
      if (!current) return null;
      const next = mutate(structuredClone(current));
      docs.set(id, next);
      return next;
    }),
    delete: jest.fn(async (id: string) => {
      docs.delete(id);
    }),
    list: jest.fn(async () => [...docs.values()]),
  };
  const identities = {
    resolve: jest.fn(async (id?: string) => {
      if (id && id !== 'default') throw new NotFoundException();
      return padrao;
    }),
  };
  const gemini = {
    generateJson: jest.fn(async (prompt: string) =>
      prompt.includes('Gere agora o slide')
        ? { html: options.html ?? '<div style="width:1080px">ok</div>' }
        : (options.plan ?? planOf(3)),
    ),
  };
  const storage = { remove: jest.fn(async () => undefined) };
  const config = { get: jest.fn(() => undefined) };
  const service = new ArtworkService(
    repository as any,
    identities as any,
    gemini as any,
    storage as any,
    config as any,
  );
  return { service, repository, identities, gemini, storage };
}

async function createdArtwork(
  ctx: ReturnType<typeof makeService>,
  overrides: Record<string, unknown> = {},
) {
  return ctx.service.create(
    {
      prompt: 'Carrossel de phrasal verbs',
      format: 'carousel',
      slideCount: 3,
      ...overrides,
    } as any,
    manager,
  );
}

describe('ArtworkService — roteiro', () => {
  it('gera o roteiro com a identidade padrão e cria a arte em rascunho', async () => {
    const ctx = makeService();

    const art = await createdArtwork(ctx);

    const [prompt, , opts] = ctx.gemini.generateJson.mock.calls[0] as unknown[];
    expect(prompt).toContain('IDENTIDADE PADRÃO roxo e dourado');
    expect(prompt).toContain('exatamente 3 slides');
    expect(opts).toMatchObject({ model: 'gemini-2.5-flash' });
    expect(art).toMatchObject({
      format: 'carousel',
      slideCount: 3,
      status: 'draft',
      identityId: 'default',
      identityName: padrao.name,
      identitySnapshot: padrao.content,
      createdBy: 'manager-1',
    });
    expect(art.slides).toEqual([
      { html: null, preview: null },
      { html: null, preview: null },
      { html: null, preview: null },
    ]);
  });

  it('identidade descrita na hora substitui a salva e fica congelada', async () => {
    const ctx = makeService();

    const art = await createdArtwork(ctx, {
      identityId: 'default',
      customIdentity: 'Neon verde sobre preto.',
    });

    expect(ctx.identities.resolve).not.toHaveBeenCalled();
    expect(art.identityId).toBeNull();
    expect(art.identitySnapshot).toBe('Neon verde sobre preto.');
    const [prompt] = ctx.gemini.generateJson.mock.calls[0];
    expect(prompt).toContain('Neon verde sobre preto.');
    expect(prompt).not.toContain('IDENTIDADE PADRÃO');
  });

  it.each([
    ['carousel', 1],
    ['carousel', 11],
    ['post', 3],
    ['story', 2],
  ])('recusa %s com %i slides', async (format, slideCount) => {
    const ctx = makeService();

    await expect(
      createdArtwork(ctx, { format, slideCount }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.gemini.generateJson).not.toHaveBeenCalled();
  });

  it('post e story têm um slide mesmo sem slideCount', async () => {
    const ctx = makeService({ plan: planOf(1) });

    const art = await createdArtwork(ctx, {
      format: 'story',
      slideCount: undefined,
    });

    expect(art.slideCount).toBe(1);
  });

  it('recusa foto fora da pasta das artes', async () => {
    const ctx = makeService();

    await expect(
      createdArtwork(ctx, {
        photos: [{ url: 'https://x.com/a.png', path: 'avatars/a.png' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('corta slides a mais do roteiro e recusa roteiro curto', async () => {
    const longo = makeService({ plan: planOf(5) });
    expect((await createdArtwork(longo)).plan.slides).toHaveLength(3);

    const curto = makeService({ plan: planOf(2) });
    await expect(createdArtwork(curto)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});

describe('ArtworkService — slides', () => {
  it('gera o HTML de um slide sanitizado, com a identidade congelada', async () => {
    const ctx = makeService({
      html: '<div style="width:1080px"><script>x()</script><p onclick="y()">Give up</p></div>',
    });
    const art = await createdArtwork(ctx, { photos: [photo()] });

    const updated = await ctx.service.generateSlide(art.id, 1, {});

    const [prompt] = ctx.gemini.generateJson.mock.calls[1];
    expect(prompt).toContain(padrao.content);
    expect(prompt).toContain('slide 2 de 3');
    expect(prompt).toContain('data-photo="1"');
    expect(updated.slides[1].html).toContain('Give up');
    expect(updated.slides[1].html).not.toMatch(/script|onclick/);
    expect(updated.status).toBe('draft');
  });

  it('fica pronta quando todos os slides têm HTML', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);

    await ctx.service.generateSlide(art.id, 0, {});
    await ctx.service.generateSlide(art.id, 1, {});
    const done = await ctx.service.generateSlide(art.id, 2, {});

    expect(done.status).toBe('ready');
  });

  it('refazer leva a nota e o HTML anterior, e descarta a prévia velha', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);
    await ctx.service.generateSlide(art.id, 0, {});
    await ctx.service.setPreview(art.id, 0, photo('prev'));

    const redone = await ctx.service.generateSlide(art.id, 0, {
      note: 'título maior',
    });

    const prompt = ctx.gemini.generateJson.mock.calls.at(-1)![0];
    expect(prompt).toContain('título maior');
    expect(prompt).toContain('<div style="width:1080px">ok</div>');
    expect(redone.slides[0].preview).toBeNull();
    expect(ctx.storage.remove).toHaveBeenCalledWith('artworks/prev.jpg');
  });

  it('a prévia que chega durante a geração do slide seguinte não se perde', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);
    await ctx.service.generateSlide(art.id, 0, {});

    // O slide 1 espera o Gemini; nesse meio-tempo chega a prévia do slide 0.
    let release!: () => void;
    ctx.gemini.generateJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ html: '<div>dois</div>' });
        }),
    );
    const slide1 = ctx.service.generateSlide(art.id, 1, {});
    await new Promise((r) => setImmediate(r));
    await ctx.service.setPreview(art.id, 0, photo('p0'));
    release();
    const final = await slide1;

    expect(final.slides[0].preview?.path).toBe('artworks/p0.jpg');
    expect(final.slides[1].html).toContain('dois');
  });

  it('índice fora da peça é 400; arte que não existe é 404', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);

    await expect(
      ctx.service.generateSlide(art.id, 3, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ctx.service.generateSlide('nada', 0, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('HTML que fica vazio depois da sanitização é erro da IA', async () => {
    const ctx = makeService({ html: '<script>x()</script>' });
    const art = await createdArtwork(ctx);

    await expect(
      ctx.service.generateSlide(art.id, 0, {}),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('ArtworkService — prévia e galeria', () => {
  it('registra a prévia do slide e troca a anterior', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);

    await ctx.service.setPreview(art.id, 0, photo('p1'));
    const updated = await ctx.service.setPreview(art.id, 0, photo('p2'));

    expect(updated.slides[0].preview?.path).toBe('artworks/p2.jpg');
    expect(ctx.storage.remove).toHaveBeenCalledWith('artworks/p1.jpg');
  });

  it('recusa prévia fora da pasta das artes', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);

    await expect(
      ctx.service.setPreview(art.id, 0, {
        url: 'https://x.com/a.png',
        path: 'avatars/a.png',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('apagar remove prévias e fotos do Storage e depois a arte', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx, { photos: [photo('foto')] });
    await ctx.service.setPreview(art.id, 0, photo('p1'));

    await ctx.service.remove(art.id);

    expect(ctx.storage.remove).toHaveBeenCalledWith('artworks/p1.jpg');
    expect(ctx.storage.remove).toHaveBeenCalledWith('artworks/foto.jpg');
    expect(ctx.repository.docs.has(art.id)).toBe(false);
  });

  it('a galeria lista resumos, sem o HTML', async () => {
    const ctx = makeService();
    const art = await createdArtwork(ctx);
    await ctx.service.generateSlide(art.id, 0, {});
    await ctx.service.setPreview(art.id, 0, photo('p1'));

    const [item] = await ctx.service.list();

    expect(item).toMatchObject({
      id: art.id,
      title: 'Phrasal verbs',
      format: 'carousel',
      slideCount: 3,
      cover: photo('p1').url,
    });
    expect(item).not.toHaveProperty('slides');
  });
});
