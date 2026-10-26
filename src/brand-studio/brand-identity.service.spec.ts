import { ConflictException, NotFoundException } from '@nestjs/common';
import { BrandIdentityService } from './brand-identity.service';
import { BrandIdentity, DEFAULT_IDENTITY_ID } from './brand-identity.model';
import {
  DEFAULT_IDENTITY_CONTENT,
  DEFAULT_IDENTITY_NAME,
} from './default-identity';

const manager = { sub: 'manager-1', email: 'm@x', role: 'manager' as const };

function identity(overrides: Partial<BrandIdentity> = {}): BrandIdentity {
  return {
    id: 'outra',
    name: 'Black Friday',
    isDefault: false,
    content: 'Preto e neon.',
    createdBy: 'manager-1',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    ...overrides,
  };
}

const padrao = () =>
  identity({
    id: DEFAULT_IDENTITY_ID,
    name: DEFAULT_IDENTITY_NAME,
    isDefault: true,
    content: DEFAULT_IDENTITY_CONTENT,
    createdBy: 'system',
  });

function makeRepository(stored: BrandIdentity[] = []) {
  const docs = new Map(stored.map((i) => [i.id, i]));
  return {
    docs,
    list: jest.fn(async () => [...docs.values()]),
    get: jest.fn(async (id: string) => docs.get(id) ?? null),
    ensureDefault: jest.fn(async (seed: BrandIdentity) => {
      if (!docs.has(DEFAULT_IDENTITY_ID)) docs.set(DEFAULT_IDENTITY_ID, seed);
      return docs.get(DEFAULT_IDENTITY_ID)!;
    }),
    create: jest.fn(async (data: Omit<BrandIdentity, 'id'>) => {
      const created = { ...data, id: `id-${docs.size}` };
      docs.set(created.id, created);
      return created;
    }),
    save: jest.fn(async (data: BrandIdentity) => {
      docs.set(data.id, data);
    }),
    delete: jest.fn(async (id: string) => {
      docs.delete(id);
    }),
  };
}

function makeService(stored: BrandIdentity[] = []) {
  const repository = makeRepository(stored);
  return { service: new BrandIdentityService(repository as any), repository };
}

describe('BrandIdentityService', () => {
  describe('seed preguiçoso da identidade padrão', () => {
    it('cria a padrão a partir do texto do código na primeira leitura', async () => {
      const { service, repository } = makeService();

      const list = await service.list();

      expect(repository.ensureDefault).toHaveBeenCalledTimes(1);
      expect(list[0]).toMatchObject({
        id: DEFAULT_IDENTITY_ID,
        isDefault: true,
        name: DEFAULT_IDENTITY_NAME,
        content: DEFAULT_IDENTITY_CONTENT,
        createdBy: 'system',
      });
    });

    it('não sobrescreve a padrão que a gerente já editou', async () => {
      const editada = { ...padrao(), content: 'Ajustei o dourado.' };
      const { service } = makeService([editada]);

      const list = await service.list();

      expect(list[0].content).toBe('Ajustei o dourado.');
    });

    it('lista a padrão primeiro e as demais por nome', async () => {
      const { service } = makeService([
        identity({ id: 'z', name: 'Verão' }),
        padrao(),
        identity({ id: 'a', name: 'Ação de Natal' }),
      ]);

      const names = (await service.list()).map((i) => i.name);

      expect(names).toEqual([DEFAULT_IDENTITY_NAME, 'Ação de Natal', 'Verão']);
    });
  });

  describe('identidades customizadas', () => {
    it('cria com nome aparado, fora da padrão e com autoria', async () => {
      const { service } = makeService([padrao()]);

      const created = await service.create(
        { name: '  Black Friday ', content: 'Preto e neon.' },
        manager,
      );

      expect(created).toMatchObject({
        name: 'Black Friday',
        isDefault: false,
        createdBy: 'manager-1',
      });
    });

    it('recusa nome repetido, sem diferenciar maiúscula nem acento', async () => {
      const { service } = makeService([padrao(), identity({ name: 'Verão' })]);

      await expect(
        service.create({ name: 'verao', content: 'x' }, manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa o nome da padrão', async () => {
      const { service } = makeService([padrao()]);

      await expect(
        service.create({ name: DEFAULT_IDENTITY_NAME, content: 'x' }, manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('edita nome e texto, e aceita manter o próprio nome', async () => {
      const { service } = makeService([padrao(), identity()]);

      const updated = await service.update(
        'outra',
        { name: 'Black Friday', content: 'Preto, neon e roxo.' },
        manager,
      );

      expect(updated.content).toBe('Preto, neon e roxo.');
    });

    it('não renomeia para o nome de outra identidade', async () => {
      const { service } = makeService([
        padrao(),
        identity(),
        identity({ id: 'b', name: 'Verão' }),
      ]);

      await expect(
        service.update('outra', { name: 'VERÃO' }, manager),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 ao editar ou apagar o que não existe', async () => {
      const { service } = makeService([padrao()]);

      await expect(
        service.update('nada', { content: 'x' }, manager),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove('nada')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('apaga a customizada', async () => {
      const { service, repository } = makeService([padrao(), identity()]);

      await service.remove('outra');

      expect(repository.docs.has('outra')).toBe(false);
    });
  });

  describe('a padrão', () => {
    it('é editável', async () => {
      const { service } = makeService([padrao()]);

      const updated = await service.update(
        DEFAULT_IDENTITY_ID,
        { content: 'Dourado mais quente.' },
        manager,
      );

      expect(updated).toMatchObject({
        isDefault: true,
        content: 'Dourado mais quente.',
        updatedBy: 'manager-1',
      });
    });

    it('não pode ser apagada', async () => {
      const { service, repository } = makeService([padrao()]);

      await expect(service.remove(DEFAULT_IDENTITY_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.docs.has(DEFAULT_IDENTITY_ID)).toBe(true);
    });

    it('volta ao texto do código no reset, preservando a criação', async () => {
      const editada = {
        ...padrao(),
        name: 'Outro nome',
        content: 'Mexi em tudo.',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      const { service } = makeService([editada]);

      const reset = await service.resetDefault(manager);

      expect(reset).toMatchObject({
        name: DEFAULT_IDENTITY_NAME,
        content: DEFAULT_IDENTITY_CONTENT,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedBy: 'manager-1',
      });
    });
  });

  describe('resolve(): a identidade usada numa geração', () => {
    it('sem id, usa a padrão (criando-a se preciso)', async () => {
      const { service } = makeService();

      expect((await service.resolve()).id).toBe(DEFAULT_IDENTITY_ID);
    });

    it('com id, usa a escolhida', async () => {
      const { service } = makeService([padrao(), identity()]);

      expect((await service.resolve('outra')).name).toBe('Black Friday');
    });

    it('404 com id que não existe', async () => {
      const { service } = makeService([padrao()]);

      await expect(service.resolve('nada')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe('texto da identidade padrão', () => {
  /*
   * O texto vai inteiro para o prompt da IA. Estes são os pontos que, se
   * sumirem numa edição do código, mudam a cara de toda arte gerada.
   */
  it('traz a paleta da marca em hex, as duas fontes e as duas variações de fundo', () => {
    for (const trecho of [
      '#271c29',
      '#dcac44',
      '#eeddba',
      '#503357',
      'Outfit',
      'Inter',
      'Profundo',
      'Claro',
    ]) {
      expect(DEFAULT_IDENTITY_CONTENT).toContain(trecho);
    }
  });
});
