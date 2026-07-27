import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSummaryService } from './billing-summary.service';
import { BillingRepository } from './billing.repository';
import { LessonRepository } from '../lessons/lesson.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { UserModule } from '../users/user.module';
import { ManualPixProvider, PayoutProvider } from './payout.provider';

/**
 * `LessonRepository` e `TeacherRepository` são providos aqui em vez de
 * importados dos seus módulos: o LessonModule já depende do BillingModule
 * (para precificar a aula no fechamento) e importar de volta criaria ciclo.
 * Ambos são stateless sobre o Firestore, então uma segunda instância é
 * inofensiva.
 */
@Module({
  imports: [UserModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingSummaryService,
    BillingRepository,
    LessonRepository,
    TeacherRepository,
    { provide: PayoutProvider, useClass: ManualPixProvider },
  ],
  exports: [BillingService],
})
export class BillingModule {}
