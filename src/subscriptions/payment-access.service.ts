import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRepository } from '../users/user.repository';
import { PAYMENT_PENDING_MESSAGE } from '../guards/active-plan.guard';
import { hasPaidAccess } from '../users/paid-access';

/**
 * Lado da professora do controle de inadimplência (spec 012 RF14).
 *
 * O guard global resolve as rotas em que o **próprio** aluno é quem pede. Aqui
 * o alvo é outro: a professora agenda, remarca ou avalia a aula **de alguém**,
 * e o aluno em questão só aparece no meio da regra de negócio (no corpo do
 * pedido, na aula referenciada). Por isso a checagem é um serviço chamado
 * pelos services, e não mais um decorador de rota.
 */
@Injectable()
export class PaymentAccessService {
  constructor(private readonly users: UserRepository) {}

  /** Lança 403 quando o aluno está inadimplente. Aluno inexistente não é aqui. */
  async assertStudentIsPaying(studentId?: string): Promise<void> {
    if (!studentId) return;
    const student = await this.users.findById(studentId);
    if (student && !hasPaidAccess(student)) {
      throw new ForbiddenException(
        `${student.fullName ?? 'O aluno'} está com pagamento pendente. ${PAYMENT_PENDING_MESSAGE}`,
      );
    }
  }

  /** Situação de pagamento de vários alunos, para a professora ver o alerta. */
  async paymentStatusOf(studentIds: string[]): Promise<Map<string, boolean>> {
    const unique = [...new Set(studentIds.filter(Boolean))];
    const students = await Promise.all(
      unique.map((id) => this.users.findById(id)),
    );
    return new Map(
      students
        .filter((student): student is NonNullable<typeof student> => !!student)
        .map((student) => [student.id!, hasPaidAccess(student)]),
    );
  }
}
