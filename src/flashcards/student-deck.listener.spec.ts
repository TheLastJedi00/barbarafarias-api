import { StudentDeckListener } from './student-deck.listener';
import { User } from '../users/user.entity';

describe('StudentDeckListener', () => {
  const users = { onStudentContextChanged: jest.fn() };
  const flashcards = { ensureStudentDeck: jest.fn().mockResolvedValue(true) };
  const background = {
    run: jest.fn((_label: string, task: () => Promise<unknown>) =>
      task().then(() => undefined),
    ),
  };
  const listener = new StudentDeckListener(
    users as any,
    flashcards as any,
    background as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('se registra no UserService ao subir', () => {
    listener.onModuleInit();
    expect(users.onStudentContextChanged).toHaveBeenCalledTimes(1);
  });

  it('gera em segundo plano para aluno com objetivo ou questionário', () => {
    listener.handle({ id: 'u1', fullName: 'Ana', objective: 'x' } as User);
    expect(background.run).toHaveBeenCalledTimes(1);
    expect(flashcards.ensureStudentDeck).toHaveBeenCalledWith('u1');
  });

  it('ignora aluno ainda sem contexto (convite recém-criado)', () => {
    listener.handle({ id: 'u1', fullName: 'Ana', objective: '' } as User);
    expect(background.run).not.toHaveBeenCalled();
  });
});
