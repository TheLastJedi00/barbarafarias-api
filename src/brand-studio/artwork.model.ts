import { z } from 'zod';

/**
 * Formatos de arte da Campanha (spec 031 §3). O canvas é o tamanho final do
 * PNG em pixels: a IA monta o HTML exatamente nele e o front renderiza 1:1.
 */
export const ART_FORMATS = {
  carousel: {
    label: 'Carrossel',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    minSlides: 2,
    maxSlides: 10,
  },
  post: {
    label: 'Post',
    ratio: '3:4',
    width: 1080,
    height: 1440,
    minSlides: 1,
    maxSlides: 1,
  },
  story: {
    label: 'Stories',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    minSlides: 1,
    maxSlides: 1,
  },
} as const;

export type ArtFormat = keyof typeof ART_FORMATS;
export const ART_FORMAT_KEYS = Object.keys(ART_FORMATS) as ArtFormat[];

/** Roteiro da peça: o que a IA devolve na primeira etapa. */
export const artPlanSchema = z.object({
  title: z.string().min(1).max(200),
  variant: z.string().min(1).max(40),
  slides: z
    .array(
      z.object({
        headline: z.string().min(1).max(300),
        body: z.string().max(1000).default(''),
        visual: z.string().max(500).default(''),
      }),
    )
    .min(1)
    .max(10),
});
export type ArtPlan = z.infer<typeof artPlanSchema>;

/** Um slide: o que a IA devolve na segunda etapa. */
export const artSlideSchema = z.object({
  html: z.string().min(1).max(200_000),
});

/** Arquivo no Storage: a URL para exibir e o caminho para apagar. */
export interface StoredFile {
  url: string;
  path: string;
}

export interface ArtworkSlide {
  /** HTML sanitizado; `null` enquanto o slide não foi gerado. */
  html: string | null;
  /**
   * Miniatura (WebP) para a galeria. O PNG em tamanho cheio não é guardado:
   * o HTML basta para gerá-lo de novo, idêntico, no navegador.
   */
  preview: StoredFile | null;
}

export type ArtworkStatus = 'draft' | 'ready';

export interface Artwork {
  id: string;
  prompt: string;
  format: ArtFormat;
  slideCount: number;
  /** `null` quando a geração usou uma identidade descrita na hora. */
  identityId: string | null;
  identityName: string;
  /** O texto da identidade usado, congelado: editar a identidade depois não muda a arte. */
  identitySnapshot: string;
  photos: StoredFile[];
  plan: ArtPlan;
  slides: ArtworkSlide[];
  status: ArtworkStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
