import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { RevenueGoal } from './revenue-goal.entity';

/**
 * Metas moram em `settings/revenue_goals_{ano}`, na mesma coleção de
 * configuração que já guarda `settings/billing`. São um documento por ano, sem
 * histórico: a meta é um alvo declarado, e mudar de ideia sobre ela não
 * reescreve nenhum resultado apurado.
 */
@Injectable()
export class RevenueGoalRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private docFor(year: number) {
    return this.db.doc(`settings/revenue_goals_${year}`);
  }

  async find(year: number): Promise<RevenueGoal> {
    const snapshot = await this.docFor(year).get();
    return new RevenueGoal(
      snapshot.exists ? { ...snapshot.data(), year } : { year },
    );
  }

  async save(goal: RevenueGoal): Promise<RevenueGoal> {
    await this.docFor(goal.year).set(
      {
        year: goal.year,
        annualTarget: goal.annualTarget,
        monthlyTargets: goal.monthlyTargets ?? {},
        updatedAt: goal.updatedAt,
        updatedBy: goal.updatedBy,
      },
      { merge: true },
    );
    return goal;
  }
}
