import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { FormingFields, Turma } from './turma.entity';

@Injectable()
export class TurmaRepository {
  private readonly collection = 'turmas';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async findAll(): Promise<Turma[]> {
    const snapshot = await this.db.collection(this.collection).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.id, doc.data()));
  }

  async findById(id: string): Promise<Turma | null> {
    const doc = await this.db.collection(this.collection).doc(id).get();
    if (!doc.exists) return null;
    return this.toEntity(doc.id, doc.data() ?? {});
  }

  async create(data: Omit<Turma, 'id'>): Promise<Turma> {
    const ref = await this.db
      .collection(this.collection)
      .add(this.toPlain(data));
    return this.toEntity(ref.id, this.toPlain(data));
  }

  /**
   * O `PUT` da professora (nome, alunos, professora, sala). **Mescla** em vez
   * de substituir: substituir apagaria o calendário e o estado de uma turma em
   * formação (spec 036), que esse formulário nem conhece.
   */
  async update(
    id: string,
    data: Pick<
      Turma,
      | 'name'
      | 'studentIds'
      | 'studentNames'
      | 'teacherId'
      | 'teacherName'
      | 'meetUrl'
    >,
  ): Promise<void> {
    const doc = this.db.collection(this.collection).doc(id);
    const snapshot = await doc.get();
    if (!snapshot.exists) {
      throw new NotFoundException(`Turma ${id} não encontrada.`);
    }
    await doc.set(this.basePlain(data), { merge: true });
  }

  /** Grava a turma inteira — o ciclo da formação (spec 036). */
  async save(turma: Turma): Promise<Turma> {
    if (!turma.id) throw new Error('save() exige uma turma com id');
    await this.db
      .collection(this.collection)
      .doc(turma.id)
      .set(this.toPlain(turma));
    return turma;
  }

  async delete(id: string): Promise<void> {
    await this.db.collection(this.collection).doc(id).delete();
  }

  private toPlain(data: Omit<Turma, 'id'>): Record<string, unknown> {
    const plain: Record<string, unknown> = { ...this.basePlain(data) };
    // Só os campos presentes: turma antiga não ganha `status: null` e afins.
    for (const key of FORMING_KEYS) {
      const value = data[key];
      if (value !== undefined) plain[key] = value;
    }
    return plain;
  }

  private basePlain(
    data: Pick<
      Turma,
      | 'name'
      | 'studentIds'
      | 'studentNames'
      | 'teacherId'
      | 'teacherName'
      | 'meetUrl'
    >,
  ) {
    return {
      name: data.name,
      studentIds: data.studentIds,
      studentNames: data.studentNames,
      teacherId: data.teacherId ?? null,
      teacherName: data.teacherName ?? null,
      meetUrl: data.meetUrl ?? null,
    };
  }

  private toEntity(id: string, data: Record<string, any>): Turma {
    return new Turma(
      data.name,
      data.studentIds ?? [],
      data.studentNames ?? [],
      id,
      {
        teacherId: data.teacherId ?? undefined,
        teacherName: data.teacherName ?? undefined,
        meetUrl: data.meetUrl ?? undefined,
        ...pickForming(data),
      },
    );
  }
}

const FORMING_KEYS: (keyof FormingFields)[] = [
  'tierId',
  'dayOfWeek',
  'hour',
  'weeksOfMonth',
  'founderWeek',
  'startDate',
  'minStudents',
  'maxStudents',
  'status',
  'confirmedAt',
  'cancelledAt',
  'startHistory',
  'reminderSentAt',
  'minReachedNotifiedAt',
  'createdAt',
];

function pickForming(data: Record<string, unknown>): FormingFields {
  const picked: Record<string, unknown> = {};
  for (const key of FORMING_KEYS) {
    if (data[key] !== undefined && data[key] !== null) picked[key] = data[key];
  }
  return picked as FormingFields;
}
