/**
 * Identidade visual usada pela IA da Campanha (spec 031) para montar as artes.
 *
 * A padrão mora num documento de id fixo: assim "só existe uma padrão" é
 * garantido pela própria chave, e não por uma consulta que duas requisições
 * simultâneas poderiam responder ao mesmo tempo.
 */
export const DEFAULT_IDENTITY_ID = 'default';

export interface BrandIdentity {
  id: string;
  name: string;
  isDefault: boolean;
  /** A identidade em texto (Markdown): vai inteira para o prompt da IA. */
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}
