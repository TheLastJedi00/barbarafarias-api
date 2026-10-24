import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mux from '@mux/mux-node';

/**
 * Cliente do Mux. Construído pelo módulo, não pelo gateway, para os testes
 * injetarem um dublê — como o do Mercado Pago: nenhuma suíte toca a rede.
 *
 * `null` quando não há token configurado.
 */
export const MUX_CLIENT = 'MUX_CLIENT';

/** Mensagem única para o front reconhecer o 503 (como "pagamento indisponível"). */
export const STREAMING_UNAVAILABLE_MESSAGE =
  'Streaming de vídeo indisponível no momento. Tente novamente mais tarde.';

/** Validade dos tokens de reprodução: cobre uma aula longa com pausas. */
export const PLAYBACK_TOKEN_TTL = '6h';

/** Estado de um asset, já traduzido do vocabulário do Mux. */
export interface MuxAssetState {
  assetId: string;
  status: 'preparing' | 'ready' | 'errored';
  playbackId?: string;
  durationSec?: number;
  aspectRatio?: string;
  error?: string;
  /** O id da vídeo aula, gravado no asset na criação. */
  passthrough?: string;
}

/** Os três tokens que o `<mux-player>` usa num asset assinado. */
export interface PlaybackTokens {
  playback: string;
  thumbnail: string;
  storyboard: string;
}

export function createMuxClient(config: ConfigService): Mux | null {
  const tokenId = config.get<string>('MUX_TOKEN_ID');
  const tokenSecret = config.get<string>('MUX_TOKEN_SECRET');
  if (!tokenId || !tokenSecret) return null;

  return new Mux({
    tokenId,
    tokenSecret,
    // Os três abaixo são opcionais para o cliente subir; cada operação que
    // depende deles confere a presença antes de chamar o SDK.
    webhookSecret: config.get<string>('MUX_WEBHOOK_SECRET') || null,
    jwtSigningKey: config.get<string>('MUX_SIGNING_KEY_ID') || null,
    // Base64 do PEM: o SDK aceita os dois formatos, e base64 cabe numa linha
    // de variável de ambiente sem brigar com quebras de linha.
    jwtPrivateKey: config.get<string>('MUX_SIGNING_KEY_PRIVATE') || null,
  });
}

/**
 * Porta para o Mux (spec 027): ingere o vídeo a partir do Storage, consulta o
 * processamento, assina a reprodução e confere webhooks.
 *
 * **O original não sobe para o Mux pelo navegador.** O Mux puxa o arquivo de
 * uma URL assinada do Storage — assim uma única subida faz o backup e o stream.
 */
@Injectable()
export class MuxGateway {
  private readonly logger = new Logger(MuxGateway.name);

  constructor(@Inject(MUX_CLIENT) private readonly mux: Mux | null) {}

  isAvailable(): boolean {
    return this.mux !== null;
  }

  /**
   * Cria o asset com playback **assinado**: um link copiado do player deixa
   * de funcionar quando o token expira.
   *
   * `video_quality: 'basic'` — o nível sem custo de encoding. Aula gravada é
   * rosto, lousa e tela; o ganho do `plus` não aparece nesse conteúdo.
   */
  async createAsset(inputUrl: string, passthrough: string): Promise<string> {
    const asset = await this.client().video.assets.create({
      inputs: [{ url: inputUrl }],
      playback_policies: ['signed'],
      video_quality: 'basic',
      passthrough,
    });
    return asset.id;
  }

  async getAsset(assetId: string): Promise<MuxAssetState> {
    return toState(await this.client().video.assets.retrieve(assetId));
  }

  /** Best-effort: apagar a aula não pode falhar porque o asset já sumiu. */
  async deleteAsset(assetId: string): Promise<void> {
    if (!this.mux) return;
    try {
      await this.mux.video.assets.delete(assetId);
    } catch (error) {
      this.logger.warn(`Falha ao apagar asset ${assetId}: ${String(error)}`);
    }
  }

  /** Assinatura local (RS256), sem chamada de rede. */
  async signPlayback(playbackId: string): Promise<PlaybackTokens> {
    const client = this.client();
    if (!client.jwtSigningKey || !client.jwtPrivateKey) {
      this.logger.error('MUX_SIGNING_KEY_ID/MUX_SIGNING_KEY_PRIVATE ausentes');
      throw new ServiceUnavailableException(STREAMING_UNAVAILABLE_MESSAGE);
    }
    const tokens = await client.jwt.signPlaybackId(playbackId, {
      type: ['video', 'thumbnail', 'storyboard'],
      expiration: PLAYBACK_TOKEN_TTL,
    });
    return {
      playback: tokens['playback-token'] ?? '',
      thumbnail: tokens['thumbnail-token'] ?? '',
      storyboard: tokens['storyboard-token'] ?? '',
    };
  }

  /**
   * URL de miniatura assinada para os cards. Com playback assinado, parâmetros
   * de imagem (largura) precisam ir **dentro** do token, não na query.
   *
   * `null` em vez de erro quando não dá para assinar: a lista de aulas
   * continua útil sem as miniaturas.
   */
  async thumbnailUrl(playbackId: string): Promise<string | null> {
    if (!this.mux?.jwtSigningKey || !this.mux.jwtPrivateKey) return null;
    try {
      const token = await this.mux.jwt.signPlaybackId(playbackId, {
        type: 'thumbnail',
        expiration: PLAYBACK_TOKEN_TTL,
        params: { width: '640' },
      });
      return `https://image.mux.com/${playbackId}/thumbnail.webp?token=${token}`;
    } catch (error) {
      this.logger.warn(`Falha ao assinar miniatura: ${String(error)}`);
      return null;
    }
  }

  /**
   * Confere a assinatura (`mux-signature`, sobre o corpo cru) e devolve o
   * estado do asset — ou `null` para os eventos que não nos interessam.
   *
   * **Sem `MUX_WEBHOOK_SECRET` o webhook é recusado**, nunca aceito sem
   * conferência: mesmo padrão do Mercado Pago.
   */
  async unwrapWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<MuxAssetState | null> {
    const client = this.client();
    if (!client.webhookSecret) {
      throw new Error('MUX_WEBHOOK_SECRET ausente');
    }
    const event = await client.webhooks.unwrap(
      rawBody,
      headers as Record<string, string>,
    );
    if (
      event.type !== 'video.asset.ready' &&
      event.type !== 'video.asset.errored'
    ) {
      return null;
    }
    return toState(event.data);
  }

  private client(): Mux {
    if (!this.mux) {
      throw new ServiceUnavailableException(STREAMING_UNAVAILABLE_MESSAGE);
    }
    return this.mux;
  }
}

/** Traduz o asset do Mux (API ou webhook) para o que a aula guarda. */
function toState(asset: {
  id: string;
  status?: string;
  playback_ids?: { id: string; policy?: string }[] | null;
  duration?: number;
  aspect_ratio?: string;
  passthrough?: string;
  errors?: { messages?: string[]; type?: string } | null;
}): MuxAssetState {
  const signed =
    asset.playback_ids?.find((p) => p.policy === 'signed') ??
    asset.playback_ids?.[0];
  const status =
    asset.status === 'ready' || asset.status === 'errored'
      ? asset.status
      : 'preparing';
  return {
    assetId: asset.id,
    status,
    ...(signed ? { playbackId: signed.id } : {}),
    ...(asset.duration !== undefined
      ? { durationSec: Math.round(asset.duration) }
      : {}),
    ...(asset.aspect_ratio ? { aspectRatio: asset.aspect_ratio } : {}),
    ...(asset.passthrough ? { passthrough: asset.passthrough } : {}),
    ...(status === 'errored'
      ? {
          error:
            asset.errors?.messages?.join(' ') ||
            asset.errors?.type ||
            'Falha no processamento do vídeo.',
        }
      : {}),
  };
}
