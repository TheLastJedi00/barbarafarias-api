import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Turma } from './turma.entity';

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
    const ref = await this.db.collection(this.collection).add(this.toPlain(data));
    return this.toEntity(ref.id, this.toPlain(data));
  }

  async update(id: string, data: Omit<Turma, 'id'>): Promise<void> {
    const doc = this.db.collection(this.collection).doc(id);
    const snapshot = await doc.get();
    if (!snapshot.exists) {
      throw new NotFoundException(`Turma ${id} não encontrada.`);
    }
    await doc.set(this.toPlain(data));
  }

  async delete(id: string): Promise<void> {
    await this.db.collection(this.collection).doc(id).delete();
  }

  private toPlain(data: Omit<Turma, 'id'>) {
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
      },
    );
  }
}
