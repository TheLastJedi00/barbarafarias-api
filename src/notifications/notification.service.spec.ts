import { NotificationService } from './notification.service';
import { ResendService } from './resend.service';
import { templates } from './templates';
import { Lesson } from '../lessons/lesson.entity';
import { RescheduleRequest } from '../reschedules/reschedule.entity';
import { ROLES } from '../types/role';

describe('NotificationService', () => {
  let service: NotificationService;
  let resend: { send: jest.Mock };
  let userRepository: { findById: jest.Mock; findAll: jest.Mock };

  const lesson = new Lesson({
    id: 'l1',
    teacherId: 't1',
    teacherName: 'Ana',
    studentId: 's1',
    studentName: 'Léo',
    date: '2026-08-03',
    hour: 15,
    startAt: '2026-08-03T18:00:00.000Z',
  });

  beforeEach(() => {
    resend = { send: jest.fn().mockResolvedValue(true) };
    userRepository = {
      findById: jest.fn(async (id: string) => ({
        id,
        email: `${id}@x.com`,
        fullName: id,
      })),
      findAll: jest
        .fn()
        .mockResolvedValue([{ id: 'm1', email: 'gerente@x.com' }]),
    };
    service = new NotificationService(
      resend as any,
      userRepository as any,
    );
  });

  it('avisa a gerente quando a professora pede reagendamento', async () => {
    const request = new RescheduleRequest({
      id: 'r1',
      teacherName: 'Ana',
      studentName: 'Léo',
      kind: 'planned',
      proposedDate: '2026-08-10',
      proposedHour: 15,
      reasonType: 'saude',
    });

    await service.rescheduleRequested(request);

    expect(userRepository.findAll).toHaveBeenCalledWith(ROLES.MANAGER);
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['gerente@x.com'] }),
    );
  });

  it('avisa aluno e gerente quando a aula é perdida', async () => {
    await service.lessonMissed(lesson);

    const message = resend.send.mock.calls[0][0];
    expect(message.to).toEqual(['s1@x.com', 'gerente@x.com']);
  });

  it('avisa professora e gerente quando o aluno cancela com antecedência', async () => {
    await service.studentCancelled(lesson);

    const message = resend.send.mock.calls[0][0];
    expect(message.to).toEqual(['t1@x.com', 'gerente@x.com']);
  });

  it('não envia nada quando não há aluno pendente', async () => {
    await service.studentsPendingTeacher('Ana', []);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('falha de e-mail não propaga para a operação', async () => {
    resend.send.mockRejectedValueOnce(new Error('resend fora do ar'));
    await expect(service.lessonMissed(lesson)).resolves.toBeUndefined();
  });

  it('falha ao montar a mensagem também é engolida', async () => {
    userRepository.findAll.mockRejectedValueOnce(new Error('firestore fora'));
    await expect(service.lessonMissed(lesson)).resolves.toBeUndefined();
  });
});

describe('ResendService sem chave configurada', () => {
  it('não tenta enviar e devolve false', async () => {
    const service = new ResendService({ get: () => undefined } as any);
    await expect(
      service.send({ to: ['a@x.com'], subject: 's', html: '<p>x</p>' }),
    ).resolves.toBe(false);
  });
});

describe('templates', () => {
  it('formata data e hora em português', () => {
    const content = templates.lessonMissed(
      new Lesson({ date: '2026-08-03', hour: 15 } as any),
    );
    expect(content.html).toContain('03/08/2026 (segunda-feira) às 15h');
  });

  it('mostra a justificativa quando o motivo é "outro"', () => {
    const content = templates.rescheduleRequested(
      new RescheduleRequest({
        teacherName: 'Ana',
        studentName: 'Léo',
        kind: 'planned',
        proposedDate: '2026-08-10',
        proposedHour: 15,
        reasonType: 'outro',
        reasonText: 'mudança de cidade',
      }),
    );
    expect(content.html).toContain('mudança de cidade');
  });

  it('distingue solicitação pós-ausência de planejada', () => {
    const noShow = templates.rescheduleRequested(
      new RescheduleRequest({
        kind: 'no_show',
        proposedDate: '2026-08-10',
        proposedHour: 15,
        reasonType: 'imprevisto',
      }),
    );
    expect(noShow.html).toContain('após ausência não avisada');
  });
});
