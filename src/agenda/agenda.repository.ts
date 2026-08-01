import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { AgendaSlot } from './agenda.entity';
import { DEFAULT_SLOT_COUNT, SLOT_STEP } from '../common/slot-time';

@Injectable()
export class AgendaRepository {
  private readonly collection = 'agenda';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * docId da spec 010: um ocupante por (professora, dia, hora). Com a grade de
   * 30 min, a hora cheia continua serializando sem casas decimais (`8` → `_8`),
   * então os documentos já gravados seguem válidos; só as meias-horas
   * introduzem ids novos (`8.5` → `_8.5`).
   */
  docId(teacherId: string, dayOfWeek: number, hour: number): string {
    return `${teacherId}_${dayOfWeek}_${hour}`;
  }

  /** Grade completa (gerente) ou apenas a de uma professora. */
  async findAll(teacherId?: string): Promise<AgendaSlot[]> {
    const collection = this.db.collection(this.collection);
    const snapshot = await (teacherId
      ? collection.where('teacherId', '==', teacherId).get()
      : collection.get());
    return snapshot.docs.map((doc) => this.toEntity(doc.data()));
  }

  async findBySlot(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
  ): Promise<AgendaSlot | null> {
    const doc = await this.db
      .collection(this.collection)
      .doc(this.docId(teacherId, dayOfWeek, hour))
      .get();
    return doc.exists ? this.toEntity(doc.data()!) : null;
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

  /**
   * Blocos que ocupam a meia-hora informada. Além do documento da própria
   * hora, consulta a meia-hora anterior: um bloco de 1 hora que começa em
   * 08:00 também toma as 08:30 (spec 011 RF5).
   */
  async findCovering(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
  ): Promise<AgendaSlot[]> {
    const candidates = await Promise.all(
      [hour - SLOT_STEP, hour].map((candidate) =>
        this.findBySlot(teacherId, dayOfWeek, candidate),
      ),
    );
    return candidates.filter(
      (slot): slot is AgendaSlot => slot !== null && slot.covers(hour),
    );
  }

  async upsert(slot: AgendaSlot): Promise<void> {
    await this.upsertMany([slot]);
  }

  /** Grava o bloco inteiro de uma vez — as duas metades entram juntas ou não entram. */
  async upsertMany(slots: AgendaSlot[]): Promise<void> {
    if (slots.length === 0) return;
    const batch = this.db.batch();
    for (const slot of slots) {
      const ref = this.db
        .collection(this.collection)
        .doc(this.docId(slot.teacherId, slot.dayOfWeek, slot.hour));
      batch.set(ref, this.toPlain(slot));
    }
    await batch.commit();
  }

  async remove(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
  ): Promise<void> {
    await this.removeMany(teacherId, dayOfWeek, [hour]);
  }

  async removeMany(
    teacherId: string,
    dayOfWeek: number,
    hours: number[],
  ): Promise<void> {
    if (hours.length === 0) return;
    const batch = this.db.batch();
    for (const hour of hours) {
      batch.delete(
        this.db
          .collection(this.collection)
          .doc(this.docId(teacherId, dayOfWeek, hour)),
      );
    }
    await batch.commit();
  }

  private toPlain(slot: AgendaSlot): Record<string, any> {
    const base: Record<string, any> = {
      teacherId: slot.teacherId,
      teacherName: slot.teacherName ?? null,
      dayOfWeek: slot.dayOfWeek,
      hour: slot.hour,
      startHour: slot.startHour,
      slotCount: slot.slotCount,
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

  /**
   * Documentos anteriores à spec 011 não têm `startHour`/`slotCount`: eram
   * sempre aulas de 1 hora em hora cheia. Normalizamos para um bloco de 2
   * slots começando na própria hora — sem isso, a meia-hora seguinte a uma
   * aula legada apareceria livre e permitiria sobreposição.
   */
  private toEntity(data: Record<string, any>): AgendaSlot {
    return new AgendaSlot(
      data.teacherId ?? '',
      data.dayOfWeek,
      data.hour,
      data.occupantType,
      {
        teacherName: data.teacherName ?? undefined,
        studentId: data.studentId ?? undefined,
        studentName: data.studentName ?? undefined,
        turmaId: data.turmaId ?? undefined,
        turmaName: data.turmaName ?? undefined,
        startHour: data.startHour ?? data.hour,
        slotCount: data.slotCount ?? DEFAULT_SLOT_COUNT,
      },
    );
  }
}
