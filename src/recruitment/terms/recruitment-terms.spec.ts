import { RecruitmentTermsController } from './recruitment-terms.controller';

describe('GET /recruitment/terms lendo do módulo legal (spec 029)', () => {
  const legal = {
    getCurrent: jest.fn().mockResolvedValue({ version: '1.0' }),
    getVersion: jest.fn().mockResolvedValue({ version: '0.9' }),
  };
  const controller = new RecruitmentTermsController(legal as any);

  it('vigente = documento recruitment do legal', async () => {
    await expect(controller.current()).resolves.toEqual({ version: '1.0' });
    expect(legal.getCurrent).toHaveBeenCalledWith('recruitment');
  });

  it('versão exata = versão do documento recruitment', async () => {
    await controller.byVersion('0.9');
    expect(legal.getVersion).toHaveBeenCalledWith('recruitment', '0.9');
  });
});
