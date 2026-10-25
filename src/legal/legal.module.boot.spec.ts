import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LegalModule } from './legal.module';
import { LegalAdminService } from './legal-admin.service';
import { LegalService } from './legal.service';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { FIRESTORE } from '../firestore/firestore.module';
import { FIREBASE_AUTH } from '../firestore/firebase-auth.module';

/** Firestore e Auth de mentira, globais como os reais, sem credencial. */
@Global()
@Module({
  providers: [
    { provide: FIRESTORE, useValue: { collection: () => ({}) } },
    { provide: FIREBASE_AUTH, useValue: {} },
  ],
  exports: [FIRESTORE, FIREBASE_AUTH],
})
class FakeFirestoreModule {}

/**
 * O container resolve o legal sozinho e junto do recrutamento, que passou a
 * depender dele? Compilar não prova isso; só o boot (spec 029).
 */
describe('LegalModule — fiação', () => {
  it('sobe sozinho e com o RecruitmentModule, sem ciclo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        LegalModule,
        RecruitmentModule,
      ],
    }).compile();

    expect(moduleRef.get(LegalService)).toBeDefined();
    expect(moduleRef.get(LegalAdminService)).toBeDefined();
  });
});
