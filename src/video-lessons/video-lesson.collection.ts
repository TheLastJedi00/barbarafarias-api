/**
 * Nome da coleção das vídeo aulas (spec 027). Mora num arquivo próprio porque o
 * currículo também a consulta — para recusar a remoção de um tópico com vídeo —
 * e importar só a constante evita uma dependência circular entre os módulos.
 */
export const VIDEO_LESSONS_COLLECTION = 'videoLessons';
