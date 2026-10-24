import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RecruitmentModule } from './recruitment.module';
import { ApplicationService } from './application.service';
import { CandidateService } from './candidate.service';
import { JobService } from './job.service';
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
 * O container resolve o módulo inteiro — auth, Storage, e-mail e o freio do
 * cadastro? Compilar não prova isso; só o boot (spec 028).
 */
describe('RecruitmentModule — fiação', () => {
  it('sobe sem chaves externas', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        RecruitmentModule,
      ],
    }).compile();

    expect(moduleRef.get(JobService)).toBeDefined();
    expect(moduleRef.get(CandidateService)).toBeDefined();
    expect(moduleRef.get(ApplicationService)).toBeDefined();
  });
});
