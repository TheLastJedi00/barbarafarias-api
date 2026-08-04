import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { FIRESTORE } from '../firestore/firestore.module';
import { InfraExpense, monthsOfYear } from './infra-expense.entity';

@Injectable()
export class InfraExpenseRepository {
  private readonly collection = 'infrastructure_expenses';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private get expenses() {
    return this.db.collection(this.collection);
  }

  /**
   * Histórico completo, do snapshot mais antigo para o mais novo. A coleção
   * cresce uma linha por reajuste (raro), então lê-la inteira é mais barato
   * que manter índices para cada recorte — e todos os cálculos temporais
   * precisam da série de qualquer forma.
   */
  async findAll(): Promise<InfraExpense[]> {
    const snapshot = await this.expenses.get();
    return snapshot.docs
      .map((doc) => this.toEntity(doc.id, doc.data()))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  /** Snapshot vigente em 'YYYY-MM': o último que começou até aquele mês. */
  async findForMonth(month: string): Promise<InfraExpense | null> {
    const applicable = (await this.findAll()).filter(
      (expense) => expense.effectiveFrom <= month,
    );
    return applicable.length === 0 ? null : applicable[applicable.length - 1];
  }

  /**
   * Snapshots que influenciam qualquer mês do ano — inclui o último anterior a
   * janeiro, que é quem vigora até o primeiro reajuste do ano.
   */
  async findForYear(year: number): Promise<InfraExpense[]> {
    const all = await this.findAll();
    const [january] = monthsOfYear(year);
    const december = `${year}-12`;

    const previous = all.filter((expense) => expense.effectiveFrom < january);
    const within = all.filter(
      (expense) =>
        expense.effectiveFrom >= january && expense.effectiveFrom <= december,
    );

    return previous.length === 0
      ? within
      : [previous[previous.length - 1], ...within];
  }

  async save(expense: InfraExpense): Promise<InfraExpense> {
    const id = expense.id ?? randomUUID();
    const created = new InfraExpense({ ...expense, id });
    await this.expenses.doc(id).set(this.toPlain(created));
    return created;
  }

  private toPlain(expense: InfraExpense): Record<string, unknown> {
    return {
      monthlyAmount: expense.monthlyAmount,
      effectiveFrom: expense.effectiveFrom,
      createdAt: expense.createdAt,
      createdBy: expense.createdBy,
    };
  }

  private toEntity(id: string, data: Record<string, any>): InfraExpense {
    return new InfraExpense({
      id,
      monthlyAmount: data.monthlyAmount ?? 0,
      effectiveFrom: data.effectiveFrom ?? '',
      createdAt: data.createdAt ?? '',
      createdBy: data.createdBy ?? '',
    });
  }
}
