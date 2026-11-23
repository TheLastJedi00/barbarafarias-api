import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PracticeModule } from './practice.module';
import { PracticeService } from './practice.service';
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

describe('PracticeModule — fiação', () => {
  it('sobe sem dependência faltando', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ GEMINI_API_KEY: 'teste' })],
        }),
        FakeFirestoreModule,
        PracticeModule,
      ],
    }).compile();

    expect(moduleRef.get(PracticeService)).toBeDefined();
  });
});
