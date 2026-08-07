import { CurriculumRepository } from './curriculum.repository';

/**
 * Dublê mínimo do Firestore: só o caminho `collection(...).doc(...).get()`,
 * que é tudo o que o repositório usa para ler um nível.
 */
function makeDb(storedModules: unknown) {
  return {
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({
            exists: true,
            data: () => ({ prompt: 'nível', modules: storedModules }),
          }),
      }),
    }),
  };
}

describe('CurriculumRepository (leitura tolerante ao campo pré-020)', () => {
  /**
   * Os docs gravados antes da spec 020 guardam o título do tópico num campo
   * chamado `prompt`. Se a leitura não os aceitasse, todo currículo já
   * cadastrado em produção apareceria sem títulos de tópico — que é
   * exatamente a estrutura que a geração passou a consumir.
   */
  it('lê o título do tópico do campo antigo `prompt`', async () => {
    const repository = new CurriculumRepository(
      makeDb([
        {
          id: 'm1',
          title: 'Módulo 1',
          context: 'ctx',
          order: 0,
          topics: [{ id: 't1', prompt: 'Greetings', order: 0 }],
        },
      ]) as any,
    );

    const level = await repository.getLevel('A1');
    expect(level!.modules[0].topics[0].title).toBe('Greetings');
  });

  it('prefere `title` quando o doc já foi migrado', async () => {
    const repository = new CurriculumRepository(
      makeDb([
        {
          id: 'm1',
          title: 'Módulo 1',
          context: 'ctx',
          order: 0,
          topics: [{ id: 't1', title: 'novo', prompt: 'antigo', order: 0 }],
        },
      ]) as any,
    );

    const level = await repository.getLevel('A1');
    expect(level!.modules[0].topics[0].title).toBe('novo');
  });

  it('não quebra em módulo sem tópicos nem em doc sem módulos', async () => {
    const semTopicos = new CurriculumRepository(
      makeDb([{ id: 'm1', title: 'M', order: 0 }]) as any,
    );
    const semModulos = new CurriculumRepository(makeDb(undefined) as any);

    expect((await semTopicos.getLevel('A1'))!.modules[0].topics).toEqual([]);
    expect((await semModulos.getLevel('A1'))!.modules).toEqual([]);
  });
});
