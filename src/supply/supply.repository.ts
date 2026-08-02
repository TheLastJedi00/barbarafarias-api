import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { Level } from '../types/student.level';
import { Inject, Injectable } from '@nestjs/common';
import { Supply } from './supply.model';
import { Module } from '../types/student.supply';

/** Cabeçalho do material: o que existe, quantos módulos tem e se está pronto. */
export interface SupplyHeader {
  studentId: string;
  level: Level;
  moduleCount: number;
  status: 'draft' | 'complete';
}

/**
 * Persistência do material de apoio.
 *
 * O material morava inteiro num único documento (`student_supplies`), o que o
 * prendia ao teto de 1 MiB do Firestore. Desde a spec 011/B1.8 ele é dividido:
 * `student_supplies` guarda só o cabeçalho e `supply_modules` guarda um
 * documento por módulo, com o id do dono como prefixo — mesmo idioma do
 * `AgendaRepository` (coleção plana, docId composto determinístico, batch
 * quando a escrita precisa ser atômica).
 *
 * O docId determinístico é o que torna o retry idempotente: reenviar o módulo
 * 3 sobrescreve o mesmo documento. Um array com `arrayUnion` duplicaria, já
 * que o conteúdo regerado nunca é deep-equal ao anterior.
 */
@Injectable()
export class SupplyRepository {
  private readonly headers = 'student_supplies';
  private readonly modules = 'supply_modules';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  headerDocId(studentId: string, level: Level): string {
    return `${studentId}_${level}`;
  }

  moduleDocId(studentId: string, level: Level, index: number): string {
    return `${studentId}_${level}_m${index}`;
  }

  private headerRef(studentId: string, level: Level) {
    return this.db
      .collection(this.headers)
      .doc(this.headerDocId(studentId, level));
  }

  private moduleRef(studentId: string, level: Level, index: number) {
    return this.db
      .collection(this.modules)
      .doc(this.moduleDocId(studentId, level, index));
  }

  private headerPayload(
    studentId: string,
    level: Level,
    moduleCount: number,
    status: SupplyHeader['status'],
  ): Record<string, unknown> {
    return {
      studentId,
      level,
      moduleCount,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  private modulePayload(
    studentId: string,
    level: Level,
    index: number,
    module: Module,
  ): Record<string, unknown> {
    return {
      studentId,
      level,
      index,
      title: module.title,
      text: module.text,
      topics: module.topics,
    };
  }

  /**
   * Material anterior ao B1.8: um documento só, com `modules` embutido e sem
   * `status`. A ausência de `status` significa "gravado quando só existia o
   * caminho atômico", logo `complete` — o contrário do tropeço do A5, em que
   * um `?? 'draft'` fez todo artigo antigo ser lido como rascunho.
   */
  private isLegacy(data: Record<string, any>): boolean {
    return Array.isArray(data.modules);
  }

  private statusOf(data: Record<string, any>): SupplyHeader['status'] {
    return data.status ?? 'complete';
  }

  private moduleCountOf(data: Record<string, any>): number {
    return this.isLegacy(data)
      ? data.modules.length
      : ((data.moduleCount as number) ?? 0);
  }

  /**
   * Módulos de um material, ordenados. A ordenação é feita em memória de
   * propósito: um `orderBy('index')` somado às duas igualdades exigiria índice
   * composto, e o volume aqui é de poucas dezenas de documentos.
   */
  private async findModules(
    studentId: string,
    level: Level,
  ): Promise<{ index: number; module: Module }[]> {
    const snapshot = await this.db
      .collection(this.modules)
      .where('studentId', '==', studentId)
      .where('level', '==', level)
      .get();

    return snapshot.docs
      .map((doc) => doc.data())
      .map((data) => ({
        index: data.index as number,
        module: {
          title: data.title,
          text: data.text,
          topics: data.topics,
        } as Module,
      }))
      .sort((a, b) => a.index - b.index);
  }

  async findHeader(
    studentId: string,
    level: Level,
  ): Promise<SupplyHeader | null> {
    const doc = await this.headerRef(studentId, level).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;
    return {
      studentId: data.studentId,
      level: data.level,
      moduleCount: this.moduleCountOf(data),
      status: this.statusOf(data),
    };
  }

  /** Índices de módulo já gravados — usado pela conferência do `finish`. */
  async findModuleIndices(studentId: string, level: Level): Promise<number[]> {
    const modules = await this.findModules(studentId, level);
    return modules.map((m) => m.index);
  }

  /**
   * Escrita atômica do material inteiro (caminho de uma tacada). O cabeçalho é
   * gravado sem `merge` para que um documento legado perca o campo `modules`
   * ao ser regravado no layout novo.
   */
  async saveAll(supply: Supply): Promise<string> {
    const { studentId, level, modules } = supply.toPlainObject();
    const previous = await this.findHeader(studentId, level);
    const batch = this.db.batch();

    batch.set(
      this.headerRef(studentId, level),
      this.headerPayload(studentId, level, modules.length, 'complete'),
    );
    modules.forEach((module, index) => {
      batch.set(
        this.moduleRef(studentId, level, index),
        this.modulePayload(studentId, level, index, module),
      );
    });
    this.queueOrphanDeletes(batch, studentId, level, previous, modules.length);

    await batch.commit();
    return this.headerDocId(studentId, level);
  }

  /**
   * Grava um módulo isolado e mantém o cabeçalho em `draft`. Chamada por
   * requisição independente, pode rodar em paralelo: cada módulo tem docId
   * próprio e o cabeçalho converge (todas as escritas gravam o mesmo valor).
   */
  async saveModule(
    studentId: string,
    level: Level,
    index: number,
    moduleCount: number,
    module: Module,
  ): Promise<void> {
    const batch = this.db.batch();

    batch.set(
      this.moduleRef(studentId, level, index),
      this.modulePayload(studentId, level, index, module),
    );
    batch.set(
      this.headerRef(studentId, level),
      {
        ...this.headerPayload(studentId, level, moduleCount, 'draft'),
        // Derruba o material embutido de um documento legado sendo regravado.
        modules: FieldValue.delete(),
      },
      { merge: true },
    );

    await batch.commit();
  }

  /**
   * Fecha a consolidação: apaga módulos excedentes de uma versão anterior mais
   * longa (mesma classe do órfão do A17 na agenda) e marca o material como
   * legível. Só depois disto o `findByStudentAndLevel` passa a devolvê-lo.
   */
  async markComplete(
    studentId: string,
    level: Level,
    moduleCount: number,
  ): Promise<void> {
    const existing = await this.findModuleIndices(studentId, level);
    const batch = this.db.batch();

    for (const index of existing.filter((i) => i >= moduleCount)) {
      batch.delete(this.moduleRef(studentId, level, index));
    }
    batch.set(
      this.headerRef(studentId, level),
      this.headerPayload(studentId, level, moduleCount, 'complete'),
    );

    await batch.commit();
  }

  private queueOrphanDeletes(
    batch: FirebaseFirestore.WriteBatch,
    studentId: string,
    level: Level,
    previous: SupplyHeader | null,
    moduleCount: number,
  ): void {
    if (!previous) {
      return;
    }
    for (let index = moduleCount; index < previous.moduleCount; index++) {
      batch.delete(this.moduleRef(studentId, level, index));
    }
  }

  /**
   * Níveis com material pronto. Devolve só os cabeçalhos: as telas que
   * consomem esta listagem (`supply-list`, seletor de nível do painel) usam
   * apenas o nível, e hidratar os módulos aqui significaria baixar o material
   * inteiro dos quatro níveis para desenhar quatro rótulos.
   */
  async findHeadersByStudentId(studentId: string): Promise<SupplyHeader[]> {
    const snapshot = await this.db
      .collection(this.headers)
      .where('studentId', '==', studentId)
      .get();

    return snapshot.docs
      .map((doc) => doc.data())
      .filter((data) => this.statusOf(data) === 'complete')
      .map((data) => ({
        studentId: data.studentId,
        level: data.level,
        moduleCount: this.moduleCountOf(data),
        status: 'complete' as const,
      }));
  }

  async findByStudentAndLevel(
    studentId: string,
    level: Level,
  ): Promise<Supply | null> {
    const doc = await this.headerRef(studentId, level).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data()!;

    if (this.isLegacy(data)) {
      return new Supply(data.studentId, data.level, data.modules);
    }
    // Material a meio caminho da consolidação não pode ser servido: o aluno
    // veria um material truncado sem qualquer indicação de que falta conteúdo.
    if (this.statusOf(data) !== 'complete') {
      return null;
    }

    const modules = await this.findModules(studentId, level);
    return new Supply(
      data.studentId,
      data.level,
      modules.map((m) => m.module),
    );
  }

  async delete(studentId: string, level: Level): Promise<void> {
    const existing = await this.findModuleIndices(studentId, level);
    const batch = this.db.batch();

    for (const index of existing) {
      batch.delete(this.moduleRef(studentId, level, index));
    }
    batch.delete(this.headerRef(studentId, level));

    await batch.commit();
  }
}
