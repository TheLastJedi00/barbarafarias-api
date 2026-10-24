import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { VideoLessonModule } from './video-lesson.module';
import { VideoLessonService } from './video-lesson.service';
import { MuxGateway } from './mux.gateway';
import { MuxWebhookController } from './mux-webhook.controller';
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
 * O container resolve o módulo inteiro — currículo, Storage, usuários e o
 * cliente do Mux? Compilar não prova isso; só o boot (spec 027).
 */
describe('VideoLessonModule — fiação', () => {
  it('sobe sem chaves do Mux, com o gateway indisponível', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        FakeFirestoreModule,
        VideoLessonModule,
      ],
    }).compile();

    expect(moduleRef.get(VideoLessonService)).toBeDefined();
    expect(moduleRef.get(MuxWebhookController)).toBeDefined();
    expect(moduleRef.get(MuxGateway).isAvailable()).toBe(false);
  });
});
