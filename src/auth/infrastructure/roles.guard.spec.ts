import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  // 1. beforeEach
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          // Mock dos métodos que o Guard pode usar
          useValue: {
            get: jest.fn(),
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  // 2. A função auxiliar
  function createMockContext(user: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    } as any;
  }

  // 3. Os testes it
  it('deve estar definido', () => {
    expect(guard).toBeDefined();
  });

  it('deve permitir acesso se a rota não tiver roles (Pública para logados)', () => {
    // Mocka o reflector para retornar NULL
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);

    const context = createMockContext({ role: 'student' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('deve permitir acesso se o usuário for professor (Role exigida: teacher)', () => {
    // Rota exige 'teacher'
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['teacher']);

    // Usuário tem a flag isTeacher: true
    const context = createMockContext({
      uid: '123',
      email: 'teacher@test.com',
      isTeacher: true,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('deve bloquear acesso se o usuário NÃO for professor', () => {
    // Rota exige 'teacher'
    jest.spyOn(reflector, 'get').mockReturnValue(['teacher']);

    // Usuário tem isTeacher: false (ou undefined)
    const context = createMockContext({
      uid: '456',
      isTeacher: false,
    });

    expect(guard.canActivate(context)).toBe(false);
  });
});
