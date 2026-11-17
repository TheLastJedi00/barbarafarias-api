export interface StudentInfo {
  firstName: string;
  objectives: string;
  prognosis: string;
  /**
   * Comprador da loja (spec 033): as respostas do questionário, já em rótulo.
   * Presente, substitui objetivo e prognóstico no `[Dados do Aluno]` — o
   * comprador não tem nem um nem outro.
   */
  profile?: {
    workArea: string;
    careerStage: string;
    englishContact: string;
  };
}
