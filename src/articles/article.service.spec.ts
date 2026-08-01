import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArticleService } from './article.service';
import { ARTICLE_STATUS, Article } from './article.entity';
import { ArticleSummaryDto } from './dto/article.dto';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

const manager: AuthenticatedUser = {
  sub: 'm1',
  email: 'gerente@bf.com',
  role: 'manager',
};
const author: AuthenticatedUser = {
  sub: 't1',
  email: 'ana@bf.com',
  role: 'teacher',
};
const otherTeacher: AuthenticatedUser = {
  sub: 't2',
  email: 'bia@bf.com',
  role: 'teacher',
};
const student: AuthenticatedUser = {
  sub: 's1',
  email: 'leo@bf.com',
  role: 'student',
};

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

  /** Artigo da professora `t1` aguardando a gerente. */
  const pending = (overrides: Partial<Article> = {}) =>
    new Article({
      id: 'a2',
      title: 'Phrasal verbs',
      content: 'rascunho',
      authorId: 't1',
      authorRole: 'teacher',
      status: ARTICLE_STATUS.PENDING,
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
      ...overrides,
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
        manager,
      );

      expect(result.author.id).toBe('m1');
      expect(result.author.name).toBe('Bárbara');
      expect(result.createdAt).toBe(result.updatedAt);
      expect(repository.create).toHaveBeenCalled();
    });

    it('artigo da gerente nasce publicado', async () => {
      const result = await service.create(
        { title: 'Novo', content: 'texto' },
        manager,
      );
      expect(result.status).toBe(ARTICLE_STATUS.PUBLISHED);
    });

    it('artigo da professora entra na fila de aprovação', async () => {
      const result = await service.create(
        { title: 'Novo', content: 'texto' },
        author,
      );
      expect(result.status).toBe(ARTICLE_STATUS.PENDING);
    });
  });

  describe('update', () => {
    it('preserva os campos não enviados e renova updatedAt', async () => {
      const updated = await service.update(manager, 'a1', {
        title: 'Novo título',
      });

      expect(updated.title).toBe('Novo título');
      expect(updated.content).toBe(existing.content);
      expect(updated.createdAt).toBe(existing.createdAt);
      expect(updated.updatedAt).not.toBe(existing.updatedAt);
    });

    it('falha quando o artigo não existe', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(
        service.update(manager, 'sumiu', { title: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('professora não reescreve artigo de outra autora', async () => {
      repository.findById.mockResolvedValue(pending());

      await expect(
        service.update(otherTeacher, 'a2', { title: 'sequestrado' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('a autora reenvia o rascunho recusado para a fila', async () => {
      repository.findById.mockResolvedValue(
        pending({ status: ARTICLE_STATUS.DRAFT }),
      );

      const updated = await service.update(author, 'a2', { content: 'v2' });

      expect(updated.status).toBe(ARTICLE_STATUS.PENDING);
    });

    it('editar o que já está no ar não o tira do ar', async () => {
      repository.findById.mockResolvedValue(
        pending({ status: ARTICLE_STATUS.PUBLISHED }),
      );

      const updated = await service.update(manager, 'a2', { content: 'v2' });

      expect(updated.status).toBe(ARTICLE_STATUS.PUBLISHED);
    });
  });

  describe('aprovação', () => {
    it('approve publica', async () => {
      repository.findById.mockResolvedValue(pending());
      const result = await service.approve(manager, 'a2');
      expect(result.status).toBe(ARTICLE_STATUS.PUBLISHED);
    });

    it('reject devolve a rascunho, sem apagar', async () => {
      repository.findById.mockResolvedValue(pending());
      const result = await service.reject(manager, 'a2');
      expect(result.status).toBe(ARTICLE_STATUS.DRAFT);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('visibilidade por papel', () => {
    beforeEach(() => {
      repository.findAll.mockResolvedValue([existing, pending()]);
    });

    it('aluno só vê o que está publicado', async () => {
      const list = await service.findAll(student);
      expect(list.map((a) => a.id)).toEqual(['a1']);
    });

    it('professora vê o publicado e o próprio pendente', async () => {
      const list = await service.findAll(author);
      expect(list.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
    });

    it('professora não vê o pendente de outra', async () => {
      const list = await service.findAll(otherTeacher);
      expect(list.map((a) => a.id)).toEqual(['a1']);
    });

    it('gerente filtra a fila pelo status pedido', async () => {
      const list = await service.findAll(manager, ARTICLE_STATUS.PENDING);
      expect(list.map((a) => a.id)).toEqual(['a2']);
    });

    it('aluno recebe 404 no artigo pendente, não 403', async () => {
      repository.findById.mockResolvedValue(pending());
      await expect(service.findById(student, 'a2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('artigos da Fase 3 (sem campo status)', () => {
    it('continuam visíveis para o aluno', async () => {
      // `existing` é anterior ao fluxo de aprovação: nasceu sem `status`.
      expect(existing.status).toBeUndefined();
      const list = await service.findAll(student);
      expect(list.map((a) => a.id)).toContain('a1');
      expect(list[0].status).toBe(ARTICLE_STATUS.PUBLISHED);
    });
  });

  describe('delete', () => {
    it('não apaga silenciosamente um id inexistente', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(service.delete(manager, 'sumiu')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('professora não apaga artigo de outra autora', async () => {
      repository.findById.mockResolvedValue(pending());

      await expect(service.delete(otherTeacher, 'a2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});

describe('telefone do autor no card e no modal', () => {
  const article = new Article({
    id: 'a1',
    title: 't',
    content: 'c',
    authorId: 't1',
    authorRole: 'teacher',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  });

  const buildFor = (
    requester: AuthenticatedUser,
    phoneVisibleToStudent: boolean,
  ) =>
    new ArticleSummaryDto(
      article,
      {
        fullName: 'Ana',
        phone: '11999990000',
        phoneVisibleToStudent,
      } as never,
      requester,
    );

  it('esconde do aluno quando a professora não liberou', () => {
    expect(buildFor(student, false).author.phone).toBeUndefined();
  });

  it('mostra ao aluno quando a professora liberou', () => {
    expect(buildFor(student, true).author.phone).toBe('11999990000');
  });

  it('a gerente sempre vê', () => {
    expect(buildFor(manager, false).author.phone).toBe('11999990000');
  });

  it('a própria autora sempre vê o dela', () => {
    expect(buildFor(author, false).author.phone).toBe('11999990000');
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
