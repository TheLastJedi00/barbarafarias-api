import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { MuxGateway, createMuxClient } from './mux.gateway';

/** Dublê do SDK: só o que o gateway usa. Nenhuma suíte toca a rede. */
function makeMux(overrides: Record<string, unknown> = {}) {
  return {
    webhookSecret: 'whsec',
    jwtSigningKey: 'kid',
    jwtPrivateKey: 'pem',
    video: {
      assets: {
        create: jest.fn().mockResolvedValue({ id: 'asset-1' }),
        retrieve: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    },
    jwt: {
      signPlaybackId: jest.fn().mockResolvedValue({
        'playback-token': 'pt',
        'thumbnail-token': 'tt',
        'storyboard-token': 'st',
      }),
    },
    webhooks: { unwrap: jest.fn() },
    ...overrides,
  };
}

describe('MuxGateway (spec 027)', () => {
  it('sem tokens o cliente não é criado e o gateway responde 503', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(createMuxClient(config)).toBeNull();

    const gateway = new MuxGateway(null);
    expect(gateway.isAvailable()).toBe(false);
    await expect(gateway.createAsset('u', 'p')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('cria asset assinado a partir da URL do Storage', async () => {
    const mux = makeMux();
    const gateway = new MuxGateway(mux as any);

    expect(await gateway.createAsset('https://signed', 'lesson-1')).toBe(
      'asset-1',
    );
    expect(mux.video.assets.create).toHaveBeenCalledWith({
      inputs: [{ url: 'https://signed' }],
      playback_policies: ['signed'],
      video_quality: 'basic',
      passthrough: 'lesson-1',
    });
  });

  it('traduz asset pronto: playback assinado, duração arredondada', async () => {
    const mux = makeMux();
    mux.video.assets.retrieve.mockResolvedValue({
      id: 'asset-1',
      status: 'ready',
      duration: 125.7,
      aspect_ratio: '16:9',
      passthrough: 'lesson-1',
      playback_ids: [
        { id: 'pub', policy: 'public' },
        { id: 'sig', policy: 'signed' },
      ],
    });

    expect(await new MuxGateway(mux as any).getAsset('asset-1')).toEqual({
      assetId: 'asset-1',
      status: 'ready',
      playbackId: 'sig',
      durationSec: 126,
      aspectRatio: '16:9',
      passthrough: 'lesson-1',
    });
  });

  it('assina os três tokens do player', async () => {
    const mux = makeMux();
    const tokens = await new MuxGateway(mux as any).signPlayback('sig');

    expect(tokens).toEqual({
      playback: 'pt',
      thumbnail: 'tt',
      storyboard: 'st',
    });
    expect(mux.jwt.signPlaybackId).toHaveBeenCalledWith('sig', {
      type: ['video', 'thumbnail', 'storyboard'],
      expiration: '6h',
    });
  });

  it('sem signing key a reprodução responde 503', async () => {
    const mux = makeMux({ jwtPrivateKey: null });
    await expect(
      new MuxGateway(mux as any).signPlayback('sig'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('miniatura assinada com a largura dentro do token', async () => {
    const mux = makeMux();
    mux.jwt.signPlaybackId.mockResolvedValue('thumb-jwt');

    expect(await new MuxGateway(mux as any).thumbnailUrl('sig')).toBe(
      'https://image.mux.com/sig/thumbnail.webp?token=thumb-jwt',
    );
    expect(mux.jwt.signPlaybackId).toHaveBeenCalledWith('sig', {
      type: 'thumbnail',
      expiration: '6h',
      params: { width: '640' },
    });
  });

  it('sem signing key a miniatura é omitida, não erro', async () => {
    const mux = makeMux({ jwtSigningKey: null });
    expect(await new MuxGateway(mux as any).thumbnailUrl('sig')).toBeNull();
  });

  describe('webhook', () => {
    it('recusa quando o segredo não está configurado', async () => {
      const mux = makeMux({ webhookSecret: null });
      await expect(
        new MuxGateway(mux as any).unwrapWebhook('{}', {}),
      ).rejects.toThrow('MUX_WEBHOOK_SECRET');
      expect(mux.webhooks.unwrap).not.toHaveBeenCalled();
    });

    it('propaga assinatura inválida', async () => {
      const mux = makeMux();
      mux.webhooks.unwrap.mockRejectedValue(new Error('bad signature'));
      await expect(
        new MuxGateway(mux as any).unwrapWebhook('{}', {}),
      ).rejects.toThrow('bad signature');
    });

    it('traduz video.asset.errored', async () => {
      const mux = makeMux();
      mux.webhooks.unwrap.mockResolvedValue({
        type: 'video.asset.errored',
        data: {
          id: 'asset-1',
          status: 'errored',
          passthrough: 'lesson-1',
          errors: { messages: ['Invalid input'] },
        },
      });

      expect(
        await new MuxGateway(mux as any).unwrapWebhook('{}', {}),
      ).toMatchObject({
        status: 'errored',
        passthrough: 'lesson-1',
        error: 'Invalid input',
      });
    });

    it('ignora eventos que não são de fim de processamento', async () => {
      const mux = makeMux();
      mux.webhooks.unwrap.mockResolvedValue({
        type: 'video.asset.created',
        data: { id: 'asset-1' },
      });
      expect(
        await new MuxGateway(mux as any).unwrapWebhook('{}', {}),
      ).toBeNull();
    });
  });
});
