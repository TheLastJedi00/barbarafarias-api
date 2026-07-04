import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { AgendaSlot } from './agenda.entity';

@Injectable()
export class AgendaRepository {
  private readonly collection = 'agenda';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private docId(dayOfWeek: number, hour: number): string {
    return `${dayOfWeek}_${hour}`;
  }

  async findAll(): Promise<AgendaSlot[]> {
    const snapshot = await this.db.collection(this.collection).get();
    return snapshot.docs.map((doc) => this.toEntity(doc.data()));
  }

  async findByStudentId(studentId: string): Promise<AgendaSlot[]> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('occupantType', '==', 'student')
      .where('studentId', '==', studentId)
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc.data()));
  }

  async findByTurmaIds(turmaIds: string[]): Promise<AgendaSlot[]> {
    if (turmaIds.length === 0) return [];
    // Firestore 'in' aceita até 10 valores por consulta.
    const results: AgendaSlot[] = [];
    for (let i = 0; i < turmaIds.length; i += 10) {
      const chunk = turmaIds.slice(i, i + 10);
      const snapshot = await this.db
        .collection(this.collection)
        .where('occupantType', '==', 'turma')
        .where('turmaId', 'in', chunk)
        .get();
      results.push(...snapshot.docs.map((doc) => this.toEntity(doc.data())));
    }
    return results;
  }

  async upsert(slot: AgendaSlot): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(this.docId(slot.dayOfWeek, slot.hour))
      .set(this.toPlain(slot));
  }

  async remove(dayOfWeek: number, hour: number): Promise<void> {
    await this.db
      .collection(this.collection)
      .doc(this.docId(dayOfWeek, hour))
      .delete();
  }

  private toPlain(slot: AgendaSlot): Record<string, any> {
    const base: Record<string, any> = {
      dayOfWeek: slot.dayOfWeek,
      hour: slot.hour,
      occupantType: slot.occupantType,
    };
    if (slot.occupantType === 'student') {
      base.studentId = slot.studentId ?? null;
      base.studentName = slot.studentName ?? null;
    } else {
      base.turmaId = slot.turmaId ?? null;
      base.turmaName = slot.turmaName ?? null;
    }
    return base;
  }

  private toEntity(data: Record<string, any>): AgendaSlot {
    return new AgendaSlot(data.dayOfWeek, data.hour, data.occupantType, {
      studentId: data.studentId ?? undefined,
      studentName: data.studentName ?? undefined,
      turmaId: data.turmaId ?? undefined,
      turmaName: data.turmaName ?? undefined,
    });
  }
}
