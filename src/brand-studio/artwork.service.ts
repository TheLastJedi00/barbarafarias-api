import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { GeminiProvider } from '../supply/gemini/gemini.service';
import { StorageService } from '../uploads/storage.service';
import { sanitizeArtHtml } from './art-html.sanitizer';
import { buildPlanPrompt, buildSlidePrompt } from './art-prompts';
import {
  ART_FORMATS,
  Artwork,
  artPlanSchema,
  artSlideSchema,
  StoredFile,
} from './artwork.model';
import { ArtworkRepository } from './artwork.repository';
import { BrandIdentityService } from './brand-identity.service';
import type { CreateArtworkDto, GenerateSlideDto } from './dto/artwork.dto';

const DEFAULT_ART_MODEL = 'gemini-2.5-flash';
/** Arte pede variação; o material pedagógico fica nos 0.3 de sempre. */
const ART_TEMPERATURE = 0.7;
const CUSTOM_IDENTITY_NAME = 'Identidade personalizada';
/** Pasta do Storage das fotos e prévias (spec 031 §3). */
const ARTWORKS_FOLDER = 'artworks/';

/** Item da galeria: o que a lista precisa, sem o HTML de cada slide. */
export interface ArtworkSummary {
  id: string;
  title: string;
  prompt: string;
  format: Artwork['format'];
  slideCount: number;
  identityName: string;
  status: Artwork['status'];
  cover: string | null;
  createdAt: string;
}

/**
 * Artes da Campanha (spec 031 §3): roteiro → slide a slide → prévia.
 *
 * Gerar tudo numa chamada caberia no tempo da Vercel, mas uma falha perderia
 * a peça inteira e a tela ficaria sem progresso. Um slide por requisição deixa
 * refazer só o que deu errado.
 */
@Injectable()
export class ArtworkService {
  private readonly artModel: string;

  constructor(
    private readonly repository: ArtworkRepository,
    private readonly identities: BrandIdentityService,
    private readonly gemini: GeminiProvider,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.artModel = config.get<string>('GEMINI_ART_MODEL') || DEFAULT_ART_MODEL;
  }

  async create(
    dto: CreateArtworkDto,
    user: AuthenticatedUser,
  ): Promise<Artwork> {
    const slideCount = this.slideCountFor(dto);
    const photos = (dto.photos ?? []).map((file) => assertArtworkFile(file));

    // A identidade descrita na hora vence a escolhida na lista.
    const identity = dto.customIdentity
      ? { id: null, name: CUSTOM_IDENTITY_NAME, content: dto.customIdentity }
      : await this.identities.resolve(dto.identityId);

    const plan = await this.gemini.generateJson(
      buildPlanPrompt({
        prompt: dto.prompt,
        format: dto.format,
        slideCount,
        identity: identity.content,
        photoCount: photos.length,
      }),
      artPlanSchema,
      this.generationOptions(),
    );
    if (plan.slides.length < slideCount) {
      throw new BadGatewayException(
        'A IA devolveu um roteiro incompleto. Tente gerar de novo.',
      );
    }
    plan.slides = plan.slides.slice(0, slideCount);

    const now = new Date().toISOString();
    return this.repository.create({
      prompt: dto.prompt,
      format: dto.format,
      slideCount,
      identityId: identity.id,
      identityName: identity.name,
      identitySnapshot: identity.content,
      photos,
      plan,
      slides: Array.from({ length: slideCount }, () => ({
        html: null,
        preview: null,
      })),
      status: 'draft',
      createdBy: user.sub,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Gera (ou refaz, com `note`) o HTML de um slide. */
  async generateSlide(
    id: string,
    index: number,
    dto: GenerateSlideDto,
  ): Promise<Artwork> {
    const artwork = await this.getOrThrow(id);
    assertIndex(artwork, index);
    const current = artwork.slides[index];

    const { html } = await this.gemini.generateJson(
      buildSlidePrompt({
        prompt: artwork.prompt,
        format: artwork.format,
        identity: artwork.identitySnapshot,
        plan: artwork.plan,
        index,
        photoCount: artwork.photos.length,
        note: dto.note,
        previousHtml: current.html,
      }),
      artSlideSchema,
      this.generationOptions(),
    );
    const clean = sanitizeArtHtml(html);
    if (!clean) {
      throw new BadGatewayException(
        'A IA devolveu um slide vazio. Tente refazer.',
      );
    }

    // A geração leva segundos: grava sobre a versão atual, não sobre a lida
    // antes do Gemini (a prévia de outro slide pode ter chegado nesse meio-tempo).
    let stale: StoredFile | null = null;
    const updated = await this.repository.update(id, (latest) => {
      // A prévia era do HTML antigo: deixa de valer.
      stale = latest.slides[index].preview;
      const slides = latest.slides.map((s, i) =>
        i === index ? { html: clean, preview: null } : s,
      );
      return {
        ...latest,
        slides,
        status: slides.every((s) => s.html) ? 'ready' : 'draft',
        updatedAt: new Date().toISOString(),
      };
    });
    if (!updated) throw new NotFoundException('Arte não encontrada.');
    const old = stale as StoredFile | null;
    if (old) await this.storage.remove(old.path);
    return updated;
  }

  /** Registra a miniatura que o front renderizou e subiu em `artworks/`. */
  async setPreview(
    id: string,
    index: number,
    file: StoredFile,
  ): Promise<Artwork> {
    const preview = assertArtworkFile(file);
    assertIndex(await this.getOrThrow(id), index);
    let previous: StoredFile | null = null;
    const updated = await this.repository.update(id, (latest) => {
      previous = latest.slides[index].preview;
      return {
        ...latest,
        slides: latest.slides.map((s, i) =>
          i === index ? { ...s, preview } : s,
        ),
        updatedAt: new Date().toISOString(),
      };
    });
    if (!updated) throw new NotFoundException('Arte não encontrada.');
    const old = previous as StoredFile | null;
    if (old && old.path !== preview.path) await this.storage.remove(old.path);
    return updated;
  }

  /**
   * Bytes de uma foto anexada. O navegador não consegue ler o bucket de
   * produção com `fetch` (CORS; fix 031), e o PNG precisa da foto embutida:
   * a API lê com o Admin SDK. O caminho vem da arte gravada, nunca do cliente.
   */
  async photo(
    id: string,
    index: number,
  ): Promise<{ data: Buffer; contentType: string }> {
    const artwork = await this.getOrThrow(id);
    const photo = Number.isInteger(index) ? artwork.photos[index] : undefined;
    if (!photo) throw new BadRequestException('Foto inexistente nesta arte.');
    const file = await this.storage.download(photo.path);
    if (!file) throw new NotFoundException('A foto não está mais no Storage.');
    return file;
  }

  async list(limit?: number, before?: string): Promise<ArtworkSummary[]> {
    const artworks = await this.repository.list(limit, before);
    return artworks.map((a) => ({
      id: a.id,
      title: a.plan.title,
      prompt: a.prompt,
      format: a.format,
      slideCount: a.slideCount,
      identityName: a.identityName,
      status: a.status,
      cover: a.slides.find((s) => s.preview)?.preview?.url ?? null,
      createdAt: a.createdAt,
    }));
  }

  get(id: string): Promise<Artwork> {
    return this.getOrThrow(id);
  }

  /** Apaga prévias e fotos do Storage (best-effort) e depois a arte. */
  async remove(id: string): Promise<void> {
    const artwork = await this.getOrThrow(id);
    const files = [
      ...artwork.slides.flatMap((s) => (s.preview ? [s.preview] : [])),
      ...artwork.photos,
    ];
    await Promise.all(files.map((f) => this.storage.remove(f.path)));
    await this.repository.delete(id);
  }

  private slideCountFor(dto: CreateArtworkDto): number {
    const { minSlides, maxSlides, label } = ART_FORMATS[dto.format];
    const count = dto.slideCount ?? minSlides;
    if (count < minSlides || count > maxSlides) {
      throw new BadRequestException(
        minSlides === maxSlides
          ? `${label} tem um slide só.`
          : `${label} tem de ${minSlides} a ${maxSlides} slides.`,
      );
    }
    return count;
  }

  private generationOptions() {
    return { model: this.artModel, temperature: ART_TEMPERATURE };
  }

  private async getOrThrow(id: string): Promise<Artwork> {
    const artwork = await this.repository.get(id);
    if (!artwork) throw new NotFoundException('Arte não encontrada.');
    return artwork;
  }
}

function assertIndex(artwork: Artwork, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= artwork.slideCount) {
    throw new BadRequestException('Slide inexistente nesta arte.');
  }
}

/**
 * Só arquivo que a própria API gravou em `artworks/`: a URL tem de ser a do
 * Storage para aquele caminho. Impede apontar a arte (e o "apagar") para
 * qualquer outro objeto do bucket ou para fora dele.
 */
function assertArtworkFile(file: StoredFile): StoredFile {
  const ok =
    file.path.startsWith(ARTWORKS_FOLDER) &&
    !file.path.includes('..') &&
    file.url.startsWith('https://firebasestorage.googleapis.com/') &&
    file.url.includes(`/o/${encodeURIComponent(file.path)}?`);
  if (!ok) throw new BadRequestException('Arquivo inválido para a arte.');
  return { url: file.url, path: file.path };
}
