import { VideoLessonRepository } from './video-lesson.repository';
import { VideoLesson } from './video-lesson.model';

function makeDb() {
  const doc = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
  };
  const collection = {
    doc: jest.fn().mockReturnValue(doc),
    where: jest.fn(),
  };
  return {
    db: { collection: jest.fn().mockReturnValue(collection) },
    collection,
    doc,
  };
}

const lesson: VideoLesson = {
  id: 'v1',
  level: 'A1',
  topicId: 't1',
  title: 'Alphabet',
  description: '',
  order: 0,
  status: 'uploading',
  source: {
    storagePath: 'video-lessons/v1/source.mp4',
    fileName: 'a.mp4',
    mimeType: 'video/mp4',
    size: 10,
  },
  mux: undefined,
  materials: [],
  createdBy: 'u1',
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
};

describe('VideoLessonRepository (spec 027)', () => {
  it('grava sem o id no corpo e sem campos undefined', async () => {
    const { db, collection, doc } = makeDb();
    await new VideoLessonRepository(db as any).save(lesson);

    expect(db.collection).toHaveBeenCalledWith('videoLessons');
    expect(collection.doc).toHaveBeenCalledWith('v1');
    const data = doc.set.mock.calls[0][0];
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('mux');
    expect(data.topicId).toBe('t1');
  });

  it('lê doc incompleto com defaults seguros', async () => {
    const { db, doc } = makeDb();
    doc.get.mockResolvedValue({
      exists: true,
      id: 'v1',
      data: () => ({ level: 'A1', status: 'ready', source: lesson.source }),
    });

    const found = await new VideoLessonRepository(db as any).findById('v1');
    expect(found).toMatchObject({
      id: 'v1',
      topicId: '',
      materials: [],
      order: 0,
    });
    expect(found).not.toHaveProperty('mux');
  });
});
