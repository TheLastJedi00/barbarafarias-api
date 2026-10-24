import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { UploadModule } from '../uploads/upload.module';
import { UserModule } from '../users/user.module';
import { MUX_CLIENT, MuxGateway, createMuxClient } from './mux.gateway';
import { MuxWebhookController } from './mux-webhook.controller';
import { VideoLessonController } from './video-lesson.controller';
import { VideoLessonRepository } from './video-lesson.repository';
import { VideoLessonService } from './video-lesson.service';

/**
 * Vídeo aulas (spec 027): Storage guarda o original, Mux faz o stream, e a
 * árvore é a do currículo do nível.
 */
@Module({
  imports: [ConfigModule, CurriculumModule, UploadModule, UserModule],
  controllers: [VideoLessonController, MuxWebhookController],
  providers: [
    VideoLessonService,
    VideoLessonRepository,
    // Construído aqui, e não no gateway, para os testes injetarem um dublê.
    {
      provide: MUX_CLIENT,
      useFactory: createMuxClient,
      inject: [ConfigService],
    },
    MuxGateway,
  ],
})
export class VideoLessonModule {}
