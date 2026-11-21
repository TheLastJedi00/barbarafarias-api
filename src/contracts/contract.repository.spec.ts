import { ContractRepository } from './contract.repository';
import { Contract, contractIdOf } from './contract.entity';

/**
 * Contrato (spec 036 §6): o registro do que o aluno aceitou antes de pagar,
 * **imutável**. O repositório só cria — e criar de novo o mesmo contrato não
 * sobrescreve nada.
 */
function makeDb() {
  const store = new Map<string, Record<string, any>>();
  const ref = (id: string) => ({
    async get() {
      const data = store.get(id);
      return { exists: data !== undefined, id, data: () => data };
    },
    async create(data: Record<string, any>) {
      if (store.has(id)) {
        throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      }
      store.set(id, data);
    },
  });
  return {
    store,
    collection: () => ({
      doc: (id: string) => ref(id),
      where: (field: string, _op: string, value: unknown) => ({
        async get() {
          return {
            docs: [...store.entries()]
              .filter(([, data]) => data[field] === value)
              .map(([id, data]) => ({ id, data: () => data })),
          };
        },
      }),
    }),
  };
}

const contrato = (extra: Partial<Contract> = {}): Contract =>
  new Contract({
    studentId: 'aluno-1',
    studentName: 'Bia Lima',
    studentEmail: 'bia@x.com',
    kind: 'ENROLLMENT',
    refId: 'mat-1',
    title: 'Matrícula — Grupo semanal · terça 19:00',
    termsVersion: '2026-11-1',
    summary: 'Resumo do que foi aceito.',
    clauses: [{ title: '1. Objeto', body: 'Reserva de vaga com sinal.' }],
    deal: [
      { label: 'Turma', value: 'Grupo semanal · terça 19:00' },
      { label: 'Sinal', value: 'R$ 150,00' },
    ],
    acceptedAt: '2026-11-21T12:00:00.000-03:00',
    ...extra,
  });

describe('ContractRepository (spec 036)', () => {
  it('o id é determinístico por tipo e referência', () => {
    expect(contractIdOf('PLAN', 'aceite-9')).toBe('PLAN_aceite-9');
  });

  it('grava o texto e o negócio congelados e relê pelo id', async () => {
    const db = makeDb();
    const repository = new ContractRepository(db as any);
    const criado = await repository.create(contrato());

    expect(criado.id).toBe('ENROLLMENT_mat-1');
    const lido = await repository.findById('ENROLLMENT_mat-1');
    expect(lido).toMatchObject({
      studentId: 'aluno-1',
      clauses: [{ title: '1. Objeto', body: 'Reserva de vaga com sinal.' }],
      deal: [
        { label: 'Turma', value: 'Grupo semanal · terça 19:00' },
        { label: 'Sinal', value: 'R$ 150,00' },
      ],
    });
  });

  it('criar de novo o mesmo contrato não sobrescreve: devolve o original', async () => {
    const db = makeDb();
    const repository = new ContractRepository(db as any);
    await repository.create(contrato());
    const outra = await repository.create(
      contrato({ summary: 'Texto trocado' }),
    );

    expect(outra.summary).toBe('Resumo do que foi aceito.');
    expect(db.store.get('ENROLLMENT_mat-1')!.summary).toBe(
      'Resumo do que foi aceito.',
    );
  });

  it('lista os do aluno, do mais recente para o mais antigo', async () => {
    const db = makeDb();
    const repository = new ContractRepository(db as any);
    await repository.create(
      contrato({ refId: 'a', acceptedAt: '2026-10-01T10:00:00.000Z' }),
    );
    await repository.create(
      contrato({ refId: 'b', acceptedAt: '2026-11-01T10:00:00.000Z' }),
    );
    await repository.create(contrato({ refId: 'c', studentId: 'outro' }));

    const lista = await repository.findByStudent('aluno-1');
    expect(lista.map((item) => item.refId)).toEqual(['b', 'a']);
  });
});
