import { CanActivate, ExecutionContext, forwardRef, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin'; // Precisamos do Admin para validar o token
import { ROLES_KEY } from './decorators/roles.decorator';
import { TeacherService } from '../../teacher/application/teacher.service';
import { UserService } from '../../users/application/user.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private teacherService: TeacherService,
    @Inject(forwardRef(() => UserService))
    private userService: UserService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Auth
    const token = this.extractTokenFromHeader(request);
    if (!token) throw new UnauthorizedException('Token não fornecido');

    let userFromToken;
    try {
      userFromToken = await admin.auth().verifyIdToken(token);
    } catch (e) {
      throw new UnauthorizedException('Token inválido');
    }

    // Role
    const requiredRoles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );

    // If public
    if (!requiredRoles) {
      request['user'] = userFromToken;
      return true;
    }

    // Search in firestore
    if (requiredRoles.includes('teacher')) {
      const teacherFromDb = await this.teacherService.findTeacherById(userFromToken.uid);
      console.log(teacherFromDb);

      if (teacherFromDb?.isTeacher) {
        request['user'] = { ...userFromToken, ...teacherFromDb };
        return true;
      }

      const userFromDb = await this.userService.findById(userFromToken.uid);
      console.log(userFromDb);

      if (userFromDb?.haveTeacherRole()) {
        request['user'] = { ...userFromToken, ...userFromDb };
        return true;
      }
      return false;
    }
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}