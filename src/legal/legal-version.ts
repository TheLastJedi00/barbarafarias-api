/**
 * Numeração das versões jurídicas (spec 029 §1): `maior.menor`.
 *
 * - primeira publicação: `1.0`;
 * - com novo aceite: sobe a maior (`1.3` → `2.0`);
 * - sem novo aceite (correção de texto): sobe a menor (`1.0` → `1.1`).
 */
export function nextVersion(
  current: string | null,
  requiresReacceptance: boolean,
): string {
  if (!current) return '1.0';
  const [major, minor] = parse(current);
  return requiresReacceptance ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

/** Negativo se `a` < `b`. Número a número: `1.10` vem depois de `1.9`. */
export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor] = parse(a);
  const [bMajor, bMinor] = parse(b);
  return aMajor !== bMajor ? aMajor - bMajor : aMinor - bMinor;
}

/**
 * Em dia se aceitou alguma versão ≥ a exigida. Sem versão exigida (documento
 * ainda não publicado), ninguém fica pendente.
 */
export function isUpToDate(
  acceptedVersions: string[],
  requiredVersion: string | null,
): boolean {
  if (!requiredVersion) return true;
  return acceptedVersions.some(
    (version) => compareVersions(version, requiredVersion) >= 0,
  );
}

function parse(version: string): [number, number] {
  const [major, minor] = version.split('.').map((part) => Number(part) || 0);
  return [major ?? 0, minor ?? 0];
}
