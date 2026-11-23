import { Injectable, OnModuleInit } from '@nestjs/common';
import { BackgroundTasks } from '../common/background-tasks';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { FlashcardService, studentContext } from './flashcard.service';

/**
 * O baralho do aluno nasce na matrícula (spec 037 §3.2): quando objetivo,
 * prognóstico ou questionário são gravados, gera as 62 palavras dele depois da
 * resposta. Baralho pronto não é regerado — `ensureStudentDeck` só gera o que
 * falta, então editar o perfil depois custa uma leitura e nada mais.
 */
@Injectable()
export class StudentDeckListener implements OnModuleInit {
  constructor(
    private readonly users: UserService,
    private readonly flashcards: FlashcardService,
    private readonly background: BackgroundTasks,
  ) {}

  onModuleInit(): void {
    this.users.onStudentContextChanged((user) => this.handle(user));
  }

  handle(user: User): void {
    const id = user.id;
    if (!id || !studentContext(user)) return;
    void this.background.run(`baralho do aluno ${id}`, () =>
      this.flashcards.ensureStudentDeck(id),
    );
  }
}
