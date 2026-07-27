import { Inject, Injectable } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firestore/firestore.module';
import { BillingSettings } from './billing.entity';

@Injectable()
export class BillingRepository {
  private readonly doc = 'settings/billing';

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getSettings(): Promise<BillingSettings> {
    const snapshot = await this.db.doc(this.doc).get();
    return new BillingSettings(snapshot.exists ? snapshot.data() : {});
  }

  async saveSettings(settings: BillingSettings): Promise<void> {
    await this.db.doc(this.doc).set({ ...settings }, { merge: true });
  }
}
