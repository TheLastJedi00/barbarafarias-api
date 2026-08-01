/**
 * Remove as chaves ausentes de um DTO parcial. `class-transformer` mantém as
 * propriedades opcionais como `undefined`, e espalhar isso sobre a entidade
 * apagaria valores já gravados — este filtro deixa o merge ser de fato parcial.
 */
export function pickDefined<T extends object>(dto: T): Partial<T> {
  const entries = Object.entries(dto).filter(
    ([, value]) => value !== undefined,
  );
  return Object.fromEntries(entries) as Partial<T>;
}
