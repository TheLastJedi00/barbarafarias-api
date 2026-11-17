import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StoreAdminService } from './store-admin.service';
import { StoreProduct } from './store-product.model';

const curriculumA1 = {
  level: 'A1',
  prompt: '',
  modules: [
    {
      id: 'm1',
      title: 'Módulo 1',
      context: '',
      order: 0,
      topics: [{ id: 't1', title: 'Alphabet', order: 0 }],
    },
  ],
};

const COVER = {
  path: 'store/abc.jpg',
  url: `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent('store/abc.jpg')}?alt=media&token=x`,
};

function base(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1',
    kind: 'module',
    title: 'Módulo 1',
    description: '',
    price: 97,
    maxInstallments: 12,
    published: false,
    order: 0,
    level: 'A1',
    moduleId: 'm1',
    files: [],
    createdAt: 't0',
    updatedAt: 't0',
    ...overrides,
  };
}

const readyFile = {
  id: 'f1',
  fileName: 'a.pdf',
  storagePath: 'store-products/p1/files/f1.pdf',
  mimeType: 'application/pdf',
  size: 10,
  status: 'ready' as const,
  uploadedAt: 't0',
};

function setup() {
  const products = {
    newId: jest.fn().mockReturnValue('p1'),
    findById: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    saveOrders: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const purchases = { findByProduct: jest.fn().mockResolvedValue([]) };
  const curriculum = { getLevel: jest.fn().mockResolvedValue(curriculumA1) };
  const storage = {
    createUploadSession: jest.fn().mockResolvedValue('https://upload'),
    getObjectInfo: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    removePrefix: jest.fn().mockResolvedValue(undefined),
  };
  const service = new StoreAdminService(
    products as any,
    purchases as any,
    curriculum as any,
    storage as any,
  );
  return { service, products, purchases, curriculum, storage };
}

const download = () =>
  base({ kind: 'download', level: undefined, moduleId: undefined });

describe('StoreAdminService (spec 032)', () => {
  describe('create', () => {
    it('cria módulo a partir do currículo, no fim da vitrine e em rascunho', async () => {
      const { service, products } = setup();
      products.findAll.mockResolvedValue([
        base({ id: 'x', moduleId: 'm9', order: 4 }),
      ]);
      const created = await service.create({
        kind: 'module',
        title: 'Módulo 1',
        price: 97,
        level: 'A1',
        moduleId: 'm1',
      });
      expect(created).toMatchObject({
        id: 'p1',
        published: false,
        order: 5,
        maxInstallments: 12,
        files: [],
      });
      expect(products.save).toHaveBeenCalled();
    });

    it('módulo exige nível e módulo existentes no currículo', async () => {
      const { service } = setup();
      await expect(
        service.create({ kind: 'module', title: 'x', price: 1, level: 'A1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create({
          kind: 'module',
          title: 'x',
          price: 1,
          level: 'A1',
          moduleId: 'nao-existe',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('um produto por módulo (409 se já existe)', async () => {
      const { service, products } = setup();
      products.findAll.mockResolvedValue([base({ id: 'outro' })]);
      await expect(
        service.create({
          kind: 'module',
          title: 'x',
          price: 1,
          level: 'A1',
          moduleId: 'm1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('download não aceita moduleId e nasce sem arquivos', async () => {
      const { service } = setup();
      await expect(
        service.create({
          kind: 'download',
          title: 'Apostila',
          price: 30,
          moduleId: 'm1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const created = await service.create({
        kind: 'download',
        title: 'Apostila',
        price: 30,
      });
      expect(created.kind).toBe('download');
      expect(created.moduleId).toBeUndefined();
    });

    it('não publica na criação um download sem arquivo', async () => {
      const { service } = setup();
      await expect(
        service.create({
          kind: 'download',
          title: 'Apostila',
          price: 30,
          published: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('capa só se for arquivo da própria API em store/', async () => {
      const { service } = setup();
      await expect(
        service.create({
          kind: 'download',
          title: 'Apostila',
          price: 30,
          cover: { url: 'https://evil.com/x.jpg', path: 'store/x.jpg' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const ok = await service.create({
        kind: 'download',
        title: 'Apostila',
        price: 30,
        cover: COVER,
      });
      expect(ok.cover).toEqual(COVER);
    });
  });

  describe('update', () => {
    it('edita campos e remove a capa com null', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(base({ cover: COVER }));
      const updated = await service.update('p1', {
        title: 'Novo',
        price: 120,
        cover: null,
      });
      expect(updated).toMatchObject({ title: 'Novo', price: 120 });
      expect(updated.cover).toBeUndefined();
    });

    it('módulo não aceita trocar o nível', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(base());
      await expect(
        service.update('p1', { level: 'B1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('publicar download exige ao menos um arquivo pronto', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(download());
      await expect(
        service.update('p1', { published: true }),
      ).rejects.toBeInstanceOf(BadRequestException);

      products.findById.mockResolvedValue({
        ...download(),
        files: [readyFile],
      });
      const ok = await service.update('p1', { published: true });
      expect(ok.published).toBe(true);
    });

    it('404 quando o produto não existe', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(null);
      await expect(service.update('x', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('recusa apagar produto que já foi vendido', async () => {
      const { service, products, purchases } = setup();
      products.findById.mockResolvedValue(base());
      purchases.findByProduct.mockResolvedValue([{ status: 'PAID' }]);
      await expect(service.remove('p1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('apaga produto sem venda, com os arquivos', async () => {
      const { service, products, purchases, storage } = setup();
      products.findById.mockResolvedValue(base());
      purchases.findByProduct.mockResolvedValue([{ status: 'CANCELLED' }]);
      await service.remove('p1');
      expect(storage.removePrefix).toHaveBeenCalledWith('store-products/p1/');
      expect(products.delete).toHaveBeenCalledWith('p1');
    });
  });

  it('reordena exigindo a lista completa', async () => {
    const { service, products } = setup();
    products.findAll.mockResolvedValue([base({ id: 'a' }), base({ id: 'b' })]);
    await expect(service.reorder({ ids: ['a'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.reorder({ ids: ['b', 'a'] });
    expect(products.saveOrders).toHaveBeenCalledWith(
      [
        { id: 'b', order: 0 },
        { id: 'a', order: 1 },
      ],
      expect.any(String),
    );
  });

  describe('arquivos do download', () => {
    it('abre sessão de upload no prefixo do produto', async () => {
      const { service, products, storage } = setup();
      products.findById.mockResolvedValue(download());
      const res = await service.addFile(
        'p1',
        { fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 },
        'http://localhost:4200',
      );
      expect(res.uploadUrl).toBe('https://upload');
      const path = storage.createUploadSession.mock.calls[0][0] as string;
      expect(path).toMatch(/^store-products\/p1\/files\/.+\.pdf$/);
      expect(res.file.status).toBe('uploading');
    });

    it('arquivo só em produto download, tipo aceito e dentro do teto', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(base());
      await expect(
        service.addFile('p1', {
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          size: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      products.findById.mockResolvedValue(download());
      await expect(
        service.addFile('p1', {
          fileName: 'a.exe',
          mimeType: 'application/x-msdownload',
          size: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.addFile('p1', {
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          size: 200 * 1024 * 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirma o upload conferindo o objeto no Storage', async () => {
      const { service, products, storage } = setup();
      products.findById.mockResolvedValue({
        ...download(),
        files: [{ ...readyFile, status: 'uploading' }],
      });
      storage.getObjectInfo.mockResolvedValue(null);
      await expect(service.completeFile('p1', 'f1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      storage.getObjectInfo.mockResolvedValue({ size: 12 });
      const file = await service.completeFile('p1', 'f1');
      expect(file).toMatchObject({ status: 'ready', size: 12 });
    });

    it('não remove o último arquivo pronto de um download publicado', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue({
        ...download(),
        published: true,
        files: [readyFile],
      });
      await expect(service.removeFile('p1', 'f1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
