import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import { AnswerDto } from './dto/answer.dto';
import { PracticeController } from './practice.controller';

describe('PracticeController', () => {
  it('é só do aluno', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PracticeController)).toEqual([
      ROLES.STUDENT,
    ]);
  });

  it('delega com o uid do token', async () => {
    const service = {
      status: jest.fn(),
      today: jest.fn(),
      answer: jest.fn(),
    };
    const controller = new PracticeController(service as any);
    const user = { sub: 'u1' } as any;
    await controller.answer(user, { cardKey: 'k', correct: true });
    expect(service.answer).toHaveBeenCalledWith('u1', 'k', true);
  });

  it('missão pronta responde 200; baralho em geração responde 202 com o andamento', async () => {
    const service = { today: jest.fn() };
    const controller = new PracticeController(service as any);
    const user = { sub: 'u1' } as any;
    const res = { status: jest.fn() };

    service.today.mockResolvedValueOnce({ day: 'd', cards: [] });
    await controller.today(user, res as any);
    expect(res.status).not.toHaveBeenCalled();

    const pending = { generating: true, generated: 10, total: 62 };
    service.today.mockResolvedValueOnce(pending);
    expect(await controller.today(user, res as any)).toBe(pending);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('recusa resposta sem `correct` booleano ou com campo a mais', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const meta: ArgumentMetadata = { type: 'body', metatype: AnswerDto };
    await expect(
      pipe.transform({ cardKey: 'k', correct: 'sim' }, meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ cardKey: 'k', correct: true, score: 10 }, meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ cardKey: 'k', correct: false }, meta),
    ).resolves.toEqual({ cardKey: 'k', correct: false });
  });
});
