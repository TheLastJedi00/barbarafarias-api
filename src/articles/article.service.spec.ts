import { NotFoundException } from '@nestjs/common';
import { ArticleService } from './article.service';
import { Article } from './article.entity';
import { ArticleSummaryDto } from './dto/article.dto';

describe('ArticleService', () => {
  let service: ArticleService;
  let repository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let userRepository: { findById: jest.Mock };

  const existing = new Article({
    id: 'a1',
    title: 'Vogais longas',
    content: '# Vogais\nConteúdo original',
    authorId: 'm1',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  });

  beforeEach(() => {
    repository = {
      findAll: jest.fn().mockResolvedValue([existing]),
      findById: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation((a: Article) => Promise.resolve(a)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = {
      findById: jest.fn().mockResolvedValue({ fullName: 'Bárbara' }),
    };
    service = new ArticleService(repository as any, userRepository as any);
  });

  describe('create', () => {
    it('carimba autor, nome e datas', async () => {
      const result = await service.create(
        { title: 'Novo', content: 'texto' },
        { sub: 'm1', role: 'manager' },
      );

      expect(result.author.id).toBe('m1');
      expect(result.author.name).toBe('Bárbara');
      expect(result.createdAt).toBe(result.updatedAt);
      expect(repository.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('preserva os campos não enviados e renova updatedAt', async () => {
      const updated = await service.update('a1', { title: 'Novo título' });

      expect(updated.title).toBe('Novo título');
      expect(updated.content).toBe(existing.content);
      expect(updated.createdAt).toBe(existing.createdAt);
      expect(updated.updatedAt).not.toBe(existing.updatedAt);
    });

    it('falha quando o artigo não existe', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(service.update('sumiu', { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('não apaga silenciosamente um id inexistente', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(service.delete('sumiu')).rejects.toThrow(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});

describe('ArticleSummaryDto', () => {
  const build = (content: string) =>
    new ArticleSummaryDto(
      new Article({
        id: 'a1',
        title: 't',
        content,
        authorId: 'm1',
        createdAt: '2026-07-01',
        updatedAt: '2026-07-01',
      }),
    );

  it('limpa a marcação do Markdown no resumo', () => {
    const summary = build('# Título\n\n**negrito** e [link](http://x.com)');
    expect(summary.excerpt).toBe('Título negrito e link');
  });

  it('descarta imagens do resumo', () => {
    const summary = build('![capa](http://x.com/a.png) Texto real');
    expect(summary.excerpt).toBe('Texto real');
  });

  it('trunca resumos longos', () => {
    const summary = build('a'.repeat(300));
    expect(summary.excerpt).toHaveLength(181); // 180 + reticências
    expect(summary.excerpt.endsWith('…')).toBe(true);
  });
});
