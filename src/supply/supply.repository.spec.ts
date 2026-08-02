import { FieldValue } from 'firebase-admin/firestore';
import { SupplyRepository } from './supply.repository';
import { Supply } from './supply.model';
import type { Module } from '../types/student.supply';

/**
 * Firestore em memória, só com a superfície que o repositório usa: `doc().get`,
 * consultas de igualdade e `batch()` com `set`/`delete`/`commit`.
 *
 * Vale o custo do fake porque as três garantias mais arriscadas do B1.8 moram
 * no repositório e não aparecem num teste manual com aluno novo: a leitura de
 * material legado, a invisibilidade do material a meio caminho e a limpeza de
 * módulos órfãos.
 */
function makeDb() {
  const store = new Map<string, Record<string, any>>();

  const ref = (collection: string, id: string) => ({
    key: `${collection}/${id}`,
    async get() {
      const data = store.get(this.key);
      return { exists: data !== undefined, data: () => data };
    },
  });

  const query = (collection: string, filters: [string, unknown][]) => ({
    where(field: string, _op: string, value: unknown) {
      return query(collection, [...filters, [field, value]]);
    },
    doc(id: string) {
      return ref(collection, id);
    },
    async get() {
      const docs = [...store.entries()]
        .filter(([key]) => key.startsWith(`${collection}/`))
        .map(([, data]) => data)
        .filter((data) => filters.every(([f, v]) => data[f] === v));
      return {
        docs: docs.map((data) => ({ data: () => data })),
        empty: !docs.length,
      };
    },
  });

  // Sentinelas do Firestore (aqui só `FieldValue.delete()`) removem o campo.
  const applyMerge = (key: string, data: Record<string, any>) => {
    const next = { ...(store.get(key) ?? {}) };
    for (const [field, value] of Object.entries(data)) {
      if (value instanceof FieldValue) {
        delete next[field];
      } else {
        next[field] = value;
      }
    }
    store.set(key, next);
  };

  return {
    store,
    collection: (name: string) => query(name, []),
    batch() {
      const ops: (() => void)[] = [];
      return {
        set(
          target: any,
          data: Record<string, any>,
          opts?: { merge?: boolean },
        ) {
          ops.push(() =>
            opts?.merge
              ? applyMerge(target.key, data)
              : store.set(target.key, { ...data }),
          );
        },
        delete(target: any) {
          ops.push(() => store.delete(target.key));
        },
        async commit() {
          ops.forEach((op) => op());
        },
      };
    },
  };
}

const topic = {
  topic: 'Greetings',
  description: 'Como cumprimentar',
  examples: ['Hello'],
  curiosity: 'Curiosidade',
  roleplayInstruction: 'Faça um diálogo',
  roleplayDialog: ['A: Hi'],
  words: [{ english: 'hello', portuguese: 'olá', pronounce: 'rêlou' }],
  music: { title: 'Hello', artist: 'Adele', youtube: 'https://y.tube/x' },
};

const moduleAt = (n: number): Module => ({
  title: `Módulo ${n}`,
  text: 'Intro',
  topics: [topic],
});

describe('SupplyRepository (persistência por módulo)', () => {
  let db: ReturnType<typeof makeDb>;
  let repository: SupplyRepository;

  beforeEach(() => {
    db = makeDb();
    repository = new SupplyRepository(db as any);
  });

  const header = () => db.store.get('student_supplies/s1_A1');
  const moduleDoc = (index: number) =>
    db.store.get(`supply_modules/s1_A1_m${index}`);

  describe('docId', () => {
    it('usa o dono como prefixo, o que torna o retry idempotente', () => {
      expect(repository.moduleDocId('s1', 'A1', 3)).toBe('s1_A1_m3');
      expect(repository.headerDocId('s1', 'A1')).toBe('s1_A1');
    });
  });

  describe('saveAll (caminho atômico)', () => {
    it('grava cabeçalho completo e um documento por módulo', async () => {
      await repository.saveAll(
        new Supply('s1', 'A1', [moduleAt(0), moduleAt(1)]),
      );

      expect(header()).toMatchObject({ moduleCount: 2, status: 'complete' });
      expect(moduleDoc(0)).toMatchObject({ index: 0, title: 'Módulo 0' });
      expect(moduleDoc(1)).toMatchObject({ index: 1, title: 'Módulo 1' });
    });

    it('não deixa o campo `modules` no cabeçalho', async () => {
      await repository.saveAll(new Supply('s1', 'A1', [moduleAt(0)]));
      expect(header()!.modules).toBeUndefined();
    });

    /** Mesma classe do órfão do A17: encurtar não pode deixar resto para trás. */
    it('apaga os módulos excedentes ao regravar um material menor', async () => {
      await repository.saveAll(
        new Supply('s1', 'A1', [moduleAt(0), moduleAt(1), moduleAt(2)]),
      );
      await repository.saveAll(new Supply('s1', 'A1', [moduleAt(0)]));

      expect(moduleDoc(0)).toBeDefined();
      expect(moduleDoc(1)).toBeUndefined();
      expect(moduleDoc(2)).toBeUndefined();
    });
  });

  describe('saveModule + markComplete (caminho granular)', () => {
    it('mantém o material invisível até o fechamento', async () => {
      await repository.saveModule('s1', 'A1', 0, 2, moduleAt(0));
      expect(header()!.status).toBe('draft');
      expect(await repository.findByStudentAndLevel('s1', 'A1')).toBeNull();

      await repository.saveModule('s1', 'A1', 1, 2, moduleAt(1));
      await repository.markComplete('s1', 'A1', 2);

      const supply = await repository.findByStudentAndLevel('s1', 'A1');
      expect(supply!.toPlainObject().modules).toHaveLength(2);
    });

    it('reenviar o mesmo módulo sobrescreve em vez de duplicar', async () => {
      await repository.saveModule('s1', 'A1', 0, 1, moduleAt(0));
      await repository.saveModule('s1', 'A1', 0, 1, {
        ...moduleAt(0),
        title: 'Regerado',
      });
      await repository.markComplete('s1', 'A1', 1);

      const modules = (await repository.findByStudentAndLevel(
        's1',
        'A1',
      ))!.toPlainObject().modules;
      expect(modules).toHaveLength(1);
      expect(modules[0].title).toBe('Regerado');
    });

    it('devolve os módulos na ordem do índice, não na de chegada', async () => {
      await repository.saveModule('s1', 'A1', 2, 3, moduleAt(2));
      await repository.saveModule('s1', 'A1', 0, 3, moduleAt(0));
      await repository.saveModule('s1', 'A1', 1, 3, moduleAt(1));
      await repository.markComplete('s1', 'A1', 3);

      const titles = (await repository.findByStudentAndLevel('s1', 'A1'))!
        .toPlainObject()
        .modules.map((m) => m.title);
      expect(titles).toEqual(['Módulo 0', 'Módulo 1', 'Módulo 2']);
    });

    it('markComplete limpa módulos além do total anunciado', async () => {
      await repository.saveModule('s1', 'A1', 0, 3, moduleAt(0));
      await repository.saveModule('s1', 'A1', 1, 3, moduleAt(1));
      await repository.saveModule('s1', 'A1', 2, 3, moduleAt(2));
      await repository.markComplete('s1', 'A1', 2);

      expect(moduleDoc(2)).toBeUndefined();
      expect(header()).toMatchObject({ moduleCount: 2, status: 'complete' });
    });
  });

  describe('material legado (anterior ao B1.8)', () => {
    const legacy = () =>
      db.store.set('student_supplies/s1_A1', {
        studentId: 's1',
        level: 'A1',
        modules: [moduleAt(0), moduleAt(1)],
      });

    /**
     * Sem este fallback, todo material já gravado sumiria da tela no deploy —
     * é a regressão mais barulhenta possível desta mudança.
     */
    it('lê o material embutido de um documento sem `status`', async () => {
      legacy();
      const supply = await repository.findByStudentAndLevel('s1', 'A1');
      expect(supply!.toPlainObject().modules).toHaveLength(2);
    });

    it('aparece na listagem, apesar de não ter `status`', async () => {
      legacy();
      const headers = await repository.findHeadersByStudentId('s1');
      expect(headers).toEqual([
        { studentId: 's1', level: 'A1', moduleCount: 2, status: 'complete' },
      ]);
    });

    it('regravar pelo caminho granular derruba o `modules` embutido', async () => {
      legacy();
      await repository.saveModule('s1', 'A1', 0, 1, moduleAt(0));
      expect(header()!.modules).toBeUndefined();
      expect(header()!.status).toBe('draft');
    });
  });

  describe('findHeadersByStudentId', () => {
    it('esconde material a meio caminho da consolidação', async () => {
      await repository.saveAll(new Supply('s1', 'A1', [moduleAt(0)]));
      await repository.saveModule('s1', 'A2', 0, 2, moduleAt(0));

      const levels = (await repository.findHeadersByStudentId('s1')).map(
        (h) => h.level,
      );
      expect(levels).toEqual(['A1']);
    });
  });

  describe('delete', () => {
    it('remove o cabeçalho e todos os módulos', async () => {
      await repository.saveAll(
        new Supply('s1', 'A1', [moduleAt(0), moduleAt(1)]),
      );
      await repository.delete('s1', 'A1');

      expect(header()).toBeUndefined();
      expect(moduleDoc(0)).toBeUndefined();
      expect(moduleDoc(1)).toBeUndefined();
    });
  });
});
