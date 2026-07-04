/**
 * Fonte única de verdade para os níveis do aluno.
 * Antes existiam três definições divergentes: uma interface incorreta aqui
 * (`{ level: ... }`, usada no código como se fosse a string), um `@IsEnum`
 * inline no SupplyInfoDto e o enum VideoLevel em video.entity.
 */
export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;

export type Level = (typeof LEVELS)[number];
