/**
 * Coleções do recrutamento (spec 028). Num arquivo próprio porque o
 * `AuthService` consulta `candidates` para resolver o papel, e importar só a
 * constante evita uma dependência circular entre os módulos.
 */
export const CANDIDATES_COLLECTION = 'candidates';
export const JOBS_COLLECTION = 'jobs';
export const APPLICATIONS_COLLECTION = 'applications';
