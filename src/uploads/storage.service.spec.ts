import { StorageService, attachmentDisposition } from './storage.service';

/** Dublê do bucket: o serviço só fala com `file(path)` e `deleteFiles`. */
function makeBucket() {
  const file = {
    createResumableUpload: jest
      .fn()
      .mockResolvedValue(['https://storage.googleapis.com/upload?id=1']),
    getMetadata: jest
      .fn()
      .mockResolvedValue([{ size: '1024', contentType: 'video/mp4' }]),
    getSignedUrl: jest.fn().mockResolvedValue(['https://signed']),
  };
  return {
    file: jest.fn().mockReturnValue(file),
    deleteFiles: jest.fn().mockResolvedValue(undefined),
    handle: file,
  };
}

describe('StorageService (upload direto — spec 027)', () => {
  let service: StorageService;
  let bucket: ReturnType<typeof makeBucket>;

  beforeEach(() => {
    service = new StorageService();
    bucket = makeBucket();
    jest.spyOn(service as any, 'bucket').mockReturnValue(bucket);
  });

  it('abre sessão resumable com o content-type e a origem do front', async () => {
    const url = await service.createUploadSession(
      'video-lessons/v1/source.mp4',
      'video/mp4',
      'http://localhost:4200',
    );

    expect(url).toBe('https://storage.googleapis.com/upload?id=1');
    expect(bucket.file).toHaveBeenCalledWith('video-lessons/v1/source.mp4');
    expect(bucket.handle.createResumableUpload).toHaveBeenCalledWith({
      metadata: { contentType: 'video/mp4' },
      origin: 'http://localhost:4200',
    });
  });

  it('lê o tamanho real do objeto gravado', async () => {
    expect(await service.getObjectInfo('x')).toEqual({
      size: 1024,
      contentType: 'video/mp4',
    });
  });

  it('devolve null quando o objeto não chegou', async () => {
    bucket.handle.getMetadata.mockRejectedValue({ code: 404 });
    expect(await service.getObjectInfo('x')).toBeNull();
  });

  it('assina leitura v4 com nome de download', async () => {
    await service.signedReadUrl('p', 60_000, 'Aula 1.pdf');

    const config = bucket.handle.getSignedUrl.mock.calls[0][0];
    expect(config).toMatchObject({ version: 'v4', action: 'read' });
    expect(config.responseDisposition).toContain('filename="Aula 1.pdf"');
  });

  it('remoção por prefixo não propaga falha', async () => {
    bucket.deleteFiles.mockRejectedValue(new Error('boom'));
    await expect(service.removePrefix('video-lessons/v1/')).resolves.toBe(
      undefined,
    );
  });
});

describe('attachmentDisposition', () => {
  it('mantém o nome com acento no filename* e troca no fallback ASCII', () => {
    expect(attachmentDisposition('Lição "1".pdf')).toBe(
      `attachment; filename="Licao _1_.pdf"; filename*=UTF-8''Li%C3%A7%C3%A3o%20%221%22.pdf`,
    );
  });
});
