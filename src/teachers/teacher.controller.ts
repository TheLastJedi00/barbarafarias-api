import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { CreateTeacherDto } from './dto/CreateTeacher.dto';
import { UpdateTeacherDto } from './dto/UpdateTeacher.dto';
import { UpdateTeacherProfileDto } from '../users/dto/UpdateProfile.dto';
import { SetActiveDto } from './dto/SetActive.dto';
import { PhoneVisibilityDto } from './dto/PhoneVisibility.dto';
import { PublicTeacherDto, ResponseTeacherDto } from './dto/ResponseTeacher.dto';
import {
  AssignStudentsDto,
  UpdateStudentAssignmentDto,
} from './dto/AssignStudents.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

@Controller('teachers')
// Padrão do painel: tudo é da gerente, salvo o que estiver anotado abaixo.
@Roles(ROLES.MANAGER)
export class TeacherController {
  constructor(private readonly service: TeacherService) {}

  @Get()
  async findAll(): Promise<ResponseTeacherDto[]> {
    const summaries = await this.service.findAll();
    return summaries.map(
      ({ teacher, studentsCount }) =>
        new ResponseTeacherDto(teacher, studentsCount),
    );
  }

  @Post()
  async create(@Body() dto: CreateTeacherDto): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(await this.service.create(dto));
  }

  // Rotas fixas antes das paramétricas: /me não pode cair em /:id.
  @Get('me')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(await this.service.findById(user.sub));
  }

  /** Perfil editável pela própria professora: nome, telefone, foto e bio. */
  @Patch('me')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTeacherProfileDto,
  ): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(
      await this.service.updateOwnProfile(user.sub, dto),
    );
  }

  @Patch('me/phone-visibility')
  @Roles(ROLES.MANAGER, ROLES.TEACHER)
  async setPhoneVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PhoneVisibilityDto,
  ): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(
      await this.service.setPhoneVisibility(user.sub, dto.visible),
    );
  }

  /** Professora responsável do aluno logado — sem dados sensíveis. */
  @Get('mine')
  @Roles(ROLES.STUDENT)
  async myTeacher(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PublicTeacherDto | null> {
    const teacher = await this.service.findResponsibleFor(user.sub);
    return teacher ? new PublicTeacherDto(teacher) : null;
  }

  /**
   * Recorte público de uma professora, para qualquer autenticado. `/mine`
   * resolve a professora pelo token e só serve ao aluno dono da conta; quando
   * a gerente ou a professora abre o painel de um aluno, era isto que faltava
   * — sem a rota, o front montava a professora com o nome desnormalizado do
   * documento do aluno, e foto e bio simplesmente não existiam (spec 013
   * Task 46.1). Declarada antes de `/:id`, que é da gerente.
   */
  @Get(':id/public')
  @Roles(ROLES.MANAGER, ROLES.TEACHER, ROLES.STUDENT)
  async findPublicById(@Param('id') id: string): Promise<PublicTeacherDto> {
    return new PublicTeacherDto(await this.service.findById(id));
  }

  /** Configuração individual do aluno (professora, carga, reposição, sala). */
  @Patch('students/:studentId')
  async updateStudentAssignment(
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentAssignmentDto,
  ) {
    return this.service.updateStudentAssignment(studentId, dto);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(await this.service.findById(id));
  }

  @Get(':id/students')
  async findStudents(@Param('id') id: string) {
    return this.service.findStudents(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
  ): Promise<ResponseTeacherDto> {
    return new ResponseTeacherDto(await this.service.update(id, dto));
  }

  @Put(':id/students')
  async assignStudents(
    @Param('id') id: string,
    @Body() dto: AssignStudentsDto,
  ) {
    return this.service.assignStudents(id, dto.studentIds);
  }

  @Patch(':id/active')
  async setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    const { teacher, pendingStudents } = await this.service.setActive(
      id,
      dto.active,
    );
    return { teacher: new ResponseTeacherDto(teacher), pendingStudents };
  }
}
