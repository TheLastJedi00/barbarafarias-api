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
import { SetActiveDto } from './dto/SetActive.dto';
import { PhoneVisibilityDto } from './dto/PhoneVisibility.dto';
import { PublicTeacherDto, ResponseTeacherDto } from './dto/ResponseTeacher.dto';
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

  @Patch(':id/active')
  async setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    const { teacher, pendingStudents } = await this.service.setActive(
      id,
      dto.active,
    );
    return { teacher: new ResponseTeacherDto(teacher), pendingStudents };
  }
}
