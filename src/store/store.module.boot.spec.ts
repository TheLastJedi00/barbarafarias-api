import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StoreModule } from './store.module';
import { StoreAdminService } from './store-admin.service';
import { StoreCatalogService } from './store-catalog.service';
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

/** O container resolve a loja sozinho? Compilar não prova; só o boot (spec 032). */
describe('StoreModule — fiação', () => {
  it('sobe sem dependência faltando', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ GEMINI_API_KEY: 'teste' })],
        }),
        FakeFirestoreModule,
        StoreModule,
      ],
    }).compile();

    expect(moduleRef.get(StoreAdminService)).toBeDefined();
    expect(moduleRef.get(StoreCatalogService)).toBeDefined();
  });
});
