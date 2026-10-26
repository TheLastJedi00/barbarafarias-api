import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ROLES } from '../types/role';

const file = { buffer: Buffer.from('x'), mimetype: 'image/png' };
const as = (role: string) => ({ sub: 'u', email: 'e', role }) as any;

describe('UploadController — pastas', () => {
  const storage = {
    upload: jest.fn(async () => ({ url: 'u', path: 'p' })),
  };
  const controller = new UploadController(storage as any);

  beforeEach(() => storage.upload.mockClear());

  it.each([ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT])(
    'avatars segue aberta: %s sobe',
    async (role) => {
      await controller.upload('avatars', file, as(role));
      expect(storage.upload).toHaveBeenCalledWith(file, 'avatars');
    },
  );

  it('artworks é da gerente (spec 031)', async () => {
    await controller.upload('artworks', file, as(ROLES.MANAGER));
    expect(storage.upload).toHaveBeenCalledWith(file, 'artworks');
  });

  it.each([ROLES.TEACHER, ROLES.STUDENT])(
    'artworks recusa %s',
    async (role) => {
      await expect(
        controller.upload('artworks', file, as(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(storage.upload).not.toHaveBeenCalled();
    },
  );

  it('pasta desconhecida é 400', async () => {
    await expect(
      controller.upload('qualquer', file, as(ROLES.MANAGER)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
