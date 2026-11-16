import { StoreContentRepository } from './store-content.repository';

function doc(data: Record<string, unknown>) {
  return { get: (field: string) => data[field] };
}

describe('StoreContentRepository (spec 032)', () => {
  it('conta só vídeos prontos e só PDFs prontos, por tópico', async () => {
    const query = {
      select: jest.fn(),
      get: jest.fn().mockResolvedValue({
        docs: [
          doc({
            topicId: 't1',
            status: 'ready',
            materials: [
              { mimeType: 'application/pdf', status: 'ready' },
              { mimeType: 'application/pdf', status: 'uploading' },
              { mimeType: 'audio/mpeg', status: 'ready' },
            ],
          }),
          doc({ topicId: 't1', status: 'ready', materials: [] }),
          doc({ topicId: 't2', status: 'processing', materials: [] }),
        ],
      }),
    };
    query.select.mockReturnValue(query);
    const collection = { where: jest.fn().mockReturnValue(query) };
    const db = { collection: jest.fn().mockReturnValue(collection) };

    const counts = await new StoreContentRepository(db as any).countByTopic(
      'A1',
    );
    expect(db.collection).toHaveBeenCalledWith('videoLessons');
    expect(collection.where).toHaveBeenCalledWith('level', '==', 'A1');
    expect(counts.get('t1')).toEqual({ videos: 2, pdfs: 1 });
    expect(counts.has('t2')).toBe(false);
  });
});
