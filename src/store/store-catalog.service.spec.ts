import { NotFoundException } from '@nestjs/common';
import { StoreCatalogService } from './store-catalog.service';
import { StoreProduct } from './store-product.model';

const curriculumA1 = {
  level: 'A1',
  prompt: 'segredo do prompt',
  modules: [
    {
      id: 'm1',
      title: 'Módulo 1',
      context: 'contexto interno',
      order: 0,
      topics: [
        { id: 't1', title: 'Alphabet', order: 0 },
        { id: 't2', title: 'Só vídeo', order: 1, videoOnly: true },
      ],
    },
  ],
};

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1',
    kind: 'module',
    title: 'Módulo 1',
    description: 'desc',
    cover: { url: 'https://img', path: 'store/a.jpg' },
    price: 97,
    maxInstallments: 12,
    published: true,
    order: 1,
    level: 'A1',
    moduleId: 'm1',
    files: [],
    createdAt: 't0',
    updatedAt: 't0',
    ...overrides,
  };
}

function setup() {
  const products = {
    findPublished: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
  };
  const content = {
    countByTopic: jest.fn().mockResolvedValue(
      new Map([
        ['t1', { videos: 2, pdfs: 1 }],
        ['t2', { videos: 1, pdfs: 0 }],
      ]),
    ),
  };
  const curriculum = { getLevel: jest.fn().mockResolvedValue(curriculumA1) };
  const users = { findById: jest.fn().mockResolvedValue({ isPaying: false }) };
  const purchases = { findByUser: jest.fn().mockResolvedValue([]) };
  const service = new StoreCatalogService(
    products as any,
    content as any,
    curriculum as any,
    users as any,
    purchases as any,
  );
  return { service, products, content, curriculum, users, purchases };
}

describe('StoreCatalogService (spec 032)', () => {
  it('lista os publicados em ordem, com contagens do módulo e sem dados internos', async () => {
    const { service, products } = setup();
    products.findPublished.mockResolvedValue([
      product({ id: 'b', order: 2 }),
      product({
        id: 'a',
        kind: 'download',
        order: 0,
        moduleId: undefined,
        level: undefined,
        files: [
          {
            id: 'f1',
            fileName: 'a.pdf',
            storagePath: 'store-products/a/files/f1.pdf',
            mimeType: 'application/pdf',
            size: 10,
            status: 'ready',
            uploadedAt: 't0',
          },
        ],
      }),
    ]);

    const list = await service.listPublished();
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
    expect(list[1]).toMatchObject({ videoCount: 3, pdfCount: 1 });
    expect(list[1].coverUrl).toBe('https://img');
    expect(list[0]).toMatchObject({ fileCount: 1 });
    expect(JSON.stringify(list)).not.toContain('storagePath');
    expect(JSON.stringify(list)).not.toContain('store-products/');
  });

  it('detalhe do módulo traz tópicos com contagem, sem prompt nem contexto', async () => {
    const { service, products } = setup();
    products.findById.mockResolvedValue(product());
    const detail = await service.getPublished('p1');
    expect(detail.module).toEqual({
      title: 'Módulo 1',
      topics: [
        { title: 'Alphabet', videoCount: 2, pdfCount: 1 },
        { title: 'Só vídeo', videoCount: 1, pdfCount: 0 },
      ],
    });
    expect(JSON.stringify(detail)).not.toContain('segredo');
    expect(JSON.stringify(detail)).not.toContain('contexto interno');
  });

  it('detalhe do download lista só arquivos prontos, sem caminho', async () => {
    const { service, products } = setup();
    products.findById.mockResolvedValue(
      product({
        kind: 'download',
        moduleId: undefined,
        files: [
          {
            id: 'f1',
            fileName: 'a.pdf',
            storagePath: 'store-products/p1/files/f1.pdf',
            mimeType: 'application/pdf',
            size: 10,
            status: 'ready',
            uploadedAt: 't0',
          },
          {
            id: 'f2',
            fileName: 'b.pdf',
            storagePath: 'store-products/p1/files/f2.pdf',
            mimeType: 'application/pdf',
            size: 10,
            status: 'uploading',
            uploadedAt: 't0',
          },
        ],
      }),
    );
    const detail = await service.getPublished('p1');
    expect(detail.files).toEqual([
      { fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 },
    ]);
  });

  describe('vitrine do aluno logado', () => {
    const student = { sub: 'u1', email: 'a@x', role: 'student' as const };
    const future = new Date(Date.now() + 86_400_000).toISOString();

    it('assinante não vê os módulos do próprio nível; download aparece', async () => {
      const { service, products, users } = setup();
      users.findById.mockResolvedValue({ level: 'A1', isPaying: true });
      products.findPublished.mockResolvedValue([
        product({ id: 'a1', level: 'A1' }),
        product({ id: 'b1', level: 'B1', moduleId: 'mb' }),
        product({
          id: 'd',
          kind: 'download',
          level: 'A1',
          moduleId: undefined,
        }),
      ]);
      const list = await service.listForUser(student);
      expect(list.map((p) => p.id)).toEqual(['b1', 'd']);
    });

    it('assinante em atraso vê tudo (o plano não está valendo)', async () => {
      const { service, products, users } = setup();
      users.findById.mockResolvedValue({ level: 'A1', isPaying: false });
      products.findPublished.mockResolvedValue([product({ id: 'a1' })]);
      expect(await service.listForUser(student)).toHaveLength(1);
    });

    it('marca o que já é dele e o que está pendente', async () => {
      const { service, products, purchases } = setup();
      products.findPublished.mockResolvedValue([
        product({ id: 'p1' }),
        product({ id: 'p2', moduleId: 'm2' }),
      ]);
      purchases.findByUser.mockResolvedValue([
        {
          id: 'c1',
          productId: 'p1',
          status: 'PAID',
          accessUntil: future,
        },
        { id: 'c2', productId: 'p2', status: 'PENDING' },
      ]);
      const [p1, p2] = await service.listForUser(student);
      expect(p1.owned).toEqual({ purchaseId: 'c1', accessUntil: future });
      expect(p2.owned).toBeUndefined();
      expect(p2.pendingPurchaseId).toBe('c2');
    });
  });

  it('404 para produto inexistente ou não publicado', async () => {
    const { service, products } = setup();
    products.findById.mockResolvedValue(product({ published: false }));
    await expect(service.getPublished('p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    products.findById.mockResolvedValue(null);
    await expect(service.getPublished('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
