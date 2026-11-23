import { EventEmitter } from 'node:events';
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

  describe('GET /practice/deck/progress', () => {
    type Event = { status: string; generated: number; total: number };
    let emit: (event: Event) => void;
    let fail: (error: Error) => void;
    let unsubscribe: jest.Mock;
    let service: { watchDeckProgress: jest.Mock };
    let res: {
      status: jest.Mock;
      setHeader: jest.Mock;
      flushHeaders: jest.Mock;
      write: jest.Mock;
      end: jest.Mock;
    };
    let req: EventEmitter;

    function open() {
      const controller = new PracticeController(service as any);
      controller.deckProgress({ sub: 'u1' } as any, req as any, res as any);
    }
    const written = () =>
      res.write.mock.calls.map(([chunk]: [string]) => chunk);

    beforeEach(() => {
      jest.useFakeTimers();
      unsubscribe = jest.fn();
      service = {
        watchDeckProgress: jest.fn((_uid, onEvent, onError) => {
          emit = onEvent;
          fail = onError;
          return unsubscribe;
        }),
      };
      res = {
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };
      req = new EventEmitter();
    });

    afterEach(() => jest.useRealTimers());

    it('abre um event-stream sem buffer e ouve o baralho do próprio aluno', () => {
      open();
      expect(service.watchDeckProgress).toHaveBeenCalledWith(
        'u1',
        expect.any(Function),
        expect.any(Function),
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('envia cada mudança e fecha quando o baralho fica pronto', () => {
      open();
      emit({ status: 'generating', generated: 10, total: 62 });
      emit({ status: 'generating', generated: 15, total: 62 });
      expect(res.end).not.toHaveBeenCalled();

      emit({ status: 'ready', generated: 62, total: 62 });
      expect(written()).toEqual([
        'data: {"status":"generating","generated":10,"total":62}\n\n',
        'data: {"status":"generating","generated":15,"total":62}\n\n',
        'data: {"status":"ready","generated":62,"total":62}\n\n',
      ]);
      expect(res.end).toHaveBeenCalledTimes(1);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('fecha com erro ou baralho ausente', () => {
      open();
      emit({ status: 'error', generated: 0, total: 62 });
      expect(res.end).toHaveBeenCalledTimes(1);

      open();
      emit({ status: 'missing', generated: 0, total: 62 });
      expect(res.end).toHaveBeenCalledTimes(2);
    });

    it('fecha sozinho em 55 s, antes do teto da função', () => {
      open();
      emit({ status: 'generating', generated: 5, total: 62 });
      jest.advanceTimersByTime(54_999);
      expect(res.end).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(res.end).toHaveBeenCalledTimes(1);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('cliente que sai solta o listener; falha do listener fecha uma vez só', () => {
      open();
      req.emit('close');
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(res.end).toHaveBeenCalledTimes(1);

      open();
      fail(new Error('listener caiu'));
      fail(new Error('de novo'));
      jest.advanceTimersByTime(60_000);
      expect(res.end).toHaveBeenCalledTimes(2);
    });
  });
});
