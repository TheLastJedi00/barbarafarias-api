import { HttpException } from '@nestjs/common';
import { EmailCooldownService } from './email-cooldown.service';

describe('EmailCooldownService', () => {
  let doc: { get: jest.Mock; set: jest.Mock };
  let service: EmailCooldownService;
  let docId: string;

  beforeEach(() => {
    doc = {
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      collection: () => ({
        doc: (id: string) => {
          docId = id;
          return doc;
        },
      }),
    };
    service = new EmailCooldownService(db as any);
  });

  it('deixa passar o primeiro pedido e registra o envio', async () => {
    await service.enforce('a@b.com');
    expect(doc.set).toHaveBeenCalledWith({ lastSentAt: expect.any(Number) });
  });

  it('recusa o segundo pedido dentro do intervalo', async () => {
    doc.get.mockResolvedValue({ exists: true, data: () => ({ lastSentAt: Date.now() }) });

    await expect(service.enforce('a@b.com')).rejects.toBeInstanceOf(HttpException);
    expect(doc.set).not.toHaveBeenCalled();
  });

  it('libera de novo depois do intervalo', async () => {
    doc.get.mockResolvedValue({
      exists: true,
      data: () => ({ lastSentAt: Date.now() - 61_000 }),
    });

    await expect(service.enforce('a@b.com')).resolves.toBeUndefined();
  });

  it('não guarda o e-mail em claro nem distingue maiúsculas', async () => {
    // A coleção não pode virar uma lista de endereços digitados na tela de
    // recuperação — inclusive de quem não tem conta aqui.
    await service.enforce('  A@B.com ');
    const primeiro = docId;
    await service.enforce('a@b.com');

    expect(primeiro).toBe(docId);
    expect(primeiro).not.toContain('@');
  });

  it('não bloqueia quando o banco falha', async () => {
    doc.get.mockRejectedValue(new Error('indisponível'));

    await expect(service.enforce('a@b.com')).resolves.toBeUndefined();
  });
});
