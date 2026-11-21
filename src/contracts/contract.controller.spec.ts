import { NotFoundException, StreamableFile } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { Contract } from './contract.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

/**
 * Meus contratos (spec 036 §6): o aluno lista e baixa **os dele**; a gerente,
 * os de qualquer aluno. Contrato de outra pessoa responde 404 — 403 diria que
 * ele existe.
 */
const contrato = (studentId: string, refId: string) =>
  new Contract({
    studentId,
    studentName: 'Bia',
    studentEmail: 'bia@x.com',
    kind: 'PLAN',
    refId,
    title: 'Plano — Premium',
    termsVersion: '2026-11-1',
    summary: 'Resumo',
    clauses: [{ title: '1', body: 'Texto' }],
    deal: [{ label: 'Valor', value: 'R$ 1.800,00' }],
    acceptedAt: '2026-11-21T12:00:00.000Z',
  });

function build() {
  const store = [contrato('aluno-1', 'a'), contrato('aluno-2', 'b')];
  const service = {
    findByStudent: jest.fn(async (id: string) =>
      store.filter((item) => item.studentId === id),
    ),
    findById: jest.fn(
      async (id: string) => store.find((item) => item.id === id) ?? null,
    ),
  };
  return new ContractController(service as any);
}

const aluno = (sub: string) => ({ sub, email: 'x', role: ROLES.STUDENT });

describe('ContractController (spec 036)', () => {
  it('lista só os contratos do aluno, sem as cláusulas (a lista é leve)', async () => {
    const lista = await build().mine(aluno('aluno-1'));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: 'PLAN_a', title: 'Plano — Premium' });
    expect(lista[0]).not.toHaveProperty('clauses');
  });

  it('baixa o PDF do próprio contrato', async () => {
    const res = { setHeader: jest.fn() };
    const file = await build().myPdf('PLAN_a', aluno('aluno-1'), res as any);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="contrato-PLAN_a.pdf"',
    );
  });

  it('contrato de outro aluno é 404', async () => {
    await expect(
      build().myPdf('PLAN_b', aluno('aluno-1'), {
        setHeader: jest.fn(),
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a gerente baixa o de um aluno, conferindo que é daquele aluno', async () => {
    const controller = build();
    await expect(
      controller.studentPdf('aluno-2', 'PLAN_b', {
        setHeader: jest.fn(),
      } as any),
    ).resolves.toBeInstanceOf(StreamableFile);
    await expect(
      controller.studentPdf('aluno-1', 'PLAN_b', {
        setHeader: jest.fn(),
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('papéis: as rotas "me" são do aluno; as do aluno qualquer, só da gerente', () => {
    const rolesOf = (method: keyof ContractController): unknown =>
      Reflect.getMetadata(ROLES_KEY, ContractController.prototype[method]);
    expect(rolesOf('mine')).toEqual([ROLES.STUDENT]);
    expect(rolesOf('myPdf')).toEqual([ROLES.STUDENT]);
    expect(rolesOf('ofStudent')).toEqual([ROLES.MANAGER]);
    expect(rolesOf('studentPdf')).toEqual([ROLES.MANAGER]);
  });
});
