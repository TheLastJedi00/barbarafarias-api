import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackRepository } from './feedback.repository';
import { UserRepository } from '../users/user.repository';
import { StudentFeedback } from './feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ROLES } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { todayInAppTimezone } from '../common/time';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async findByStudent(
    user: AuthenticatedUser,
    studentId: string,
  ): Promise<StudentFeedback[]> {
    await this.assertCanAccess(user, studentId);
    return this.feedbackRepository.findByStudent(studentId);
  }

  async create(
    user: AuthenticatedUser,
    studentId: string,
    dto: CreateFeedbackDto,
    now: Date = new Date(),
  ): Promise<StudentFeedback> {
    const student = await this.assertCanAccess(user, studentId);
    // Avaliar a evolução de quem está inadimplente fica bloqueado (RF14). Ler
    // avaliações antigas continua liberado: é histórico, não serviço novo.
    if (student.isPaying === false) {
      throw new ForbiddenException(
        `${student.fullName ?? 'O aluno'} está com pagamento pendente.`,
      );
    }
    const author = await this.userRepository.findById(user.sub);

    return this.feedbackRepository.create(
      new StudentFeedback({
        studentId,
        studentName: student.fullName,
        teacherId: user.sub,
        teacherName: author?.fullName,
        lessonId: dto.lessonId,
        date: dto.date ?? todayInAppTimezone(now),
        perceivedLevel: dto.perceivedLevel,
        text: dto.text,
        createdAt: now.toISOString(),
      }),
    );
  }

  /** Gerente vê tudo; professora só o próprio aluno; aluno não vê nada. */
  private async assertCanAccess(user: AuthenticatedUser, studentId: string) {
    const student = await this.userRepository.findById(studentId);
    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }
    if (user.role === ROLES.MANAGER) {
      return student;
    }
    if (user.role === ROLES.TEACHER && student.teacherId === user.sub) {
      return student;
    }
    throw new ForbiddenException('Sem acesso ao acompanhamento deste aluno');
  }
}
