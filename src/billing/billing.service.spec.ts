import { BillingService, isPayable, payableReason } from './billing.service';
import { BillingSummaryService } from './billing-summary.service';
import { ManualPixProvider } from './payout.provider';
import { LESSON_STATUS, Lesson } from '../lessons/lesson.entity';
import { BillingSettings, DEFAULT_HOURLY_RATE } from './billing.entity';
import { ROLES } from '../types/role';

describe('regra de faturamento (§6.8)', () => {
  it('paga aula dada', () => {
    expect(isPayable(LESSON_STATUS.COMPLETED)).toBe(true);
  });

  it('paga falta do aluno sem aviso', () => {
    expect(isPayable(LESSON_STATUS.STUDENT_NO_SHOW)).toBe(true);
  });

  it('paga ausência avisada com antecedência (contrato com a professora)', () => {
    expect(isPayable(LESSON_STATUS.STUDENT_CANCELLED)).toBe(true);
  });

  it('não paga quando a professora não entrega a aula', () => {
    expect(isPayable(LESSON_STATUS.TEACHER_ABSENCE)).toBe(false);
    expect(isPayable(LESSON_STATUS.CANCELLED)).toBe(false);
  });

  it('não paga aula ainda agendada', () => {
    expect(isPayable(LESSON_STATUS.SCHEDULED)).toBe(false);
  });

  it('explica o motivo de cada situação', () => {
    expect(payableReason(LESSON_STATUS.STUDENT_NO_SHOW)).toContain('faltou');
    expect(payableReason(LESSON_STATUS.TEACHER_ABSENCE)).toContain('não paga');
  });
});

describe('BillingService', () => {
  let service: BillingService;
  let billingRepository: { getSettings: jest.Mock; saveSettings: jest.Mock };
  let userRepository: { findById: jest.Mock };

  beforeEach(() => {
    billingRepository = {
      getSettings: jest.fn().mockResolvedValue(new BillingSettings()),
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findById: jest.fn().mockResolvedValue({ id: 't1' }) };
    service = new BillingService(
      billingRepository as any,
      userRepository as any,
    );
  });

  it('usa o valor-hora global quando a professora não tem o próprio', async () => {
    await expect(service.resolveRate('t1')).resolves.toBe(DEFAULT_HOURLY_RATE);
  });

  it('o valor customizado da professora sobrepõe o global', async () => {
    userRepository.findById.mockResolvedValueOnce({ id: 't1', hourlyRate: 85 });
    await expect(service.resolveRate('t1')).resolves.toBe(85);
  });

  it('congela o valor no fechamento da aula', async () => {
    const lesson = new Lesson({
      teacherId: 't1',
      status: LESSON_STATUS.COMPLETED,
    } as any);

    await service.priceLesson(lesson);

    expect(lesson.payable).toBe(true);
    expect(lesson.rateApplied).toBe(DEFAULT_HOURLY_RATE);
  });

  it('não reescreve o valor de uma aula já precificada', async () => {
    const lesson = new Lesson({
      teacherId: 't1',
      status: LESSON_STATUS.COMPLETED,
      rateApplied: 50,
    } as any);

    billingRepository.getSettings.mockResolvedValue(
      new BillingSettings({ defaultHourlyRate: 99 }),
    );
    await service.priceLesson(lesson);

    expect(lesson.rateApplied).toBe(50);
  });

  it('aula não faturável não recebe valor', async () => {
    const lesson = new Lesson({
      teacherId: 't1',
      status: LESSON_STATUS.TEACHER_ABSENCE,
    } as any);

    await service.priceLesson(lesson);

    expect(lesson.payable).toBe(false);
    expect(lesson.rateApplied).toBeUndefined();
  });
});

describe('BillingSummaryService', () => {
  let service: BillingSummaryService;
  let lessonRepository: { findByRange: jest.Mock };
  let teacherRepository: { findAllStaff: jest.Mock };

  const lesson = (overrides: any) =>
    new Lesson({
      id: `l-${Math.random()}`,
      teacherId: 't1',
      studentName: 'Léo',
      date: '2026-08-03',
      hour: 15,
      origin: 'regular',
      ...overrides,
    });

  beforeEach(() => {
    lessonRepository = { findByRange: jest.fn().mockResolvedValue([]) };
    teacherRepository = {
      findAllStaff: jest.fn().mockResolvedValue([
        { id: 't1', fullName: 'Ana', role: ROLES.TEACHER, pixKey: 'ana@pix' },
        { id: 'm1', fullName: 'Bárbara', role: ROLES.MANAGER },
      ]),
    };
    service = new BillingSummaryService(
      lessonRepository as any,
      teacherRepository as any,
      {
        resolveRate: jest.fn().mockResolvedValue(60),
      } as any,
      new ManualPixProvider(),
    );
  });

  it('soma apenas as aulas faturáveis da professora', async () => {
    lessonRepository.findByRange.mockResolvedValue([
      lesson({ status: LESSON_STATUS.COMPLETED, rateApplied: 60 }),
      lesson({ status: LESSON_STATUS.STUDENT_NO_SHOW, rateApplied: 60 }),
      lesson({ status: LESSON_STATUS.TEACHER_ABSENCE }),
      lesson({ status: LESSON_STATUS.SCHEDULED }),
    ]);

    const [ana] = await service.summary('2026-08');

    expect(ana.payableLessons).toBe(2);
    expect(ana.unpayableLessons).toBe(2);
    expect(ana.total).toBe(120);
    expect(ana.pixKey).toBe('ana@pix');
  });

  it('marca a gerente para que não entre na folha como despesa', async () => {
    const closings = await service.summary('2026-08');
    expect(closings.find((c) => c.teacherId === 'm1')?.isManager).toBe(true);
    expect(closings.find((c) => c.teacherId === 't1')?.isManager).toBe(false);
  });

  it('detalha aula a aula com motivo e valor zerado no que não paga', async () => {
    lessonRepository.findByRange.mockResolvedValue([
      lesson({ status: LESSON_STATUS.COMPLETED, rateApplied: 60 }),
      lesson({ status: LESSON_STATUS.TEACHER_ABSENCE, date: '2026-08-10' }),
    ]);

    const lines = await service.detail('t1', '2026-08');

    expect(lines[0]).toMatchObject({ rate: 60, reason: 'Aula dada' });
    expect(lines[1]).toMatchObject({ rate: 0 });
    expect(lines[1].reason).toContain('não paga');
  });

  it('cobre o mês inteiro, inclusive o último dia', async () => {
    await service.detail('t1', '2026-02');
    expect(lessonRepository.findByRange).toHaveBeenCalledWith(
      '2026-02-01',
      '2026-02-28',
      't1',
    );
  });

  it('instrui o pagamento manual via PIX', async () => {
    lessonRepository.findByRange.mockResolvedValue([
      lesson({ status: LESSON_STATUS.COMPLETED, rateApplied: 60 }),
    ]);

    const result = await service.pay('t1', '2026-08');

    expect(result.status).toBe('manual');
    expect(result.message).toContain('ana@pix');
  });
});
