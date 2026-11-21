import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeacherService } from '../teachers/teacher.service';
import { formatSlotHour, isValidSlotHour } from '../common/slot-time';
import { TurmaRepository } from './turma.repository';
import {
  DEFAULT_MAX_STUDENTS,
  DEFAULT_MIN_STUDENTS,
  FormingFields,
  Turma,
  TURMA_STATUS,
} from './turma.entity';
import { GroupTierId, isCompatibleStart } from './turma-schedule';
import type {
  CreateFormingTurmaDto,
  UpdateFormingTurmaDto,
} from './dto/forming-turma.dto';

/** Aula de turma vale 1 hora: o último início é 20:00, para acabar às 21:00. */
const LAST_GROUP_START = 20;

const DAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

const TIER_LABELS: Record<GroupTierId, string> = {
  'weekly-group': 'Grupo semanal',
  'monthly-group': 'Grupo mensal',
};

/**
 * Turma em formação (spec 036 §3–§4). Só a gerente cria, edita e conduz o
 * ciclo; a professora continua vendo e editando nome, alunos e sala pelo
 * `TurmaService` de sempre.
 *
 * Toda escrita confere o calendário **inteiro** de novo, depois de aplicar a
 * mudança: trocar só o dia da semana deixaria o start antigo apontando para
 * outro dia, e a regra "o start cai no dia da turma" valeria só na criação.
 */
@Injectable()
export class TurmaFormingService {
  constructor(
    private readonly turmas: TurmaRepository,
    private readonly teachers: TeacherService,
  ) {}

  async create(dto: CreateFormingTurmaDto, founderId?: string): Promise<Turma> {
    const fields: FormingFields = {
      tierId: dto.tierId,
      dayOfWeek: dto.dayOfWeek,
      hour: dto.hour,
      weeksOfMonth: dto.weeksOfMonth,
      founderWeek: dto.founderWeek,
      startDate: dto.startDate,
      minStudents: dto.minStudents ?? DEFAULT_MIN_STUDENTS,
      maxStudents: dto.maxStudents ?? DEFAULT_MAX_STUDENTS,
    };
    this.assertCalendar(fields);
    const teacher = await this.resolveTeacher(dto.teacherId);
    // No grupo mensal uma das semanas é da fundadora: a gerente que criou a
    // turma. É ela quem aparece como responsável pela aula daquela semana.
    const founder =
      fields.tierId === 'monthly-group' && founderId
        ? await this.resolveTeacher(founderId)
        : null;

    return this.turmas.create(
      new Turma(dto.name?.trim() || nameOf(fields), [], [], undefined, {
        ...fields,
        teacherId: teacher.id,
        teacherName: teacher.name,
        ...(founder
          ? { founderId: founder.id, founderName: founder.name }
          : {}),
        meetUrl: dto.meetUrl,
        status: TURMA_STATUS.FORMING,
        startHistory: [],
        createdAt: new Date().toISOString(),
      }),
    );
  }

  async update(id: string, dto: UpdateFormingTurmaDto): Promise<Turma> {
    const turma = await this.requireForming(id);
    if (turma.status !== TURMA_STATUS.FORMING) {
      throw new ConflictException(
        'Só a turma em formação muda de calendário. Para mudar o start de uma turma confirmada, adie-a.',
      );
    }

    const next: Turma = Object.assign(Object.create(Turma.prototype), turma, {
      ...defined({
        dayOfWeek: dto.dayOfWeek,
        hour: dto.hour,
        weeksOfMonth: dto.weeksOfMonth,
        founderWeek: dto.founderWeek,
        startDate: dto.startDate,
        minStudents: dto.minStudents,
        maxStudents: dto.maxStudents,
        meetUrl: dto.meetUrl,
      }),
    }) as Turma;
    this.assertCalendar(next);

    if (dto.teacherId && dto.teacherId !== turma.teacherId) {
      const teacher = await this.resolveTeacher(dto.teacherId);
      next.teacherId = teacher.id;
      next.teacherName = teacher.name;
    }
    if (dto.name !== undefined) next.name = dto.name.trim() || nameOf(next);

    return this.turmas.save(next);
  }

  async findForming(): Promise<Turma[]> {
    return (await this.turmas.findAll())
      .filter((turma) => !!turma.tierId)
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  }

  async requireForming(id: string): Promise<Turma> {
    const turma = await this.turmas.findById(id);
    if (!turma || !turma.tierId) {
      throw new NotFoundException('Turma não encontrada.');
    }
    return turma;
  }

  /** As regras do §3–§4, sobre o estado **depois** da mudança. */
  assertCalendar(fields: FormingFields): void {
    const { tierId, dayOfWeek, hour, startDate } = fields;
    if (
      !tierId ||
      dayOfWeek === undefined ||
      hour === undefined ||
      !startDate
    ) {
      throw new BadRequestException(
        'A turma precisa de plano, dia, horário e data de início.',
      );
    }
    if (!isValidSlotHour(hour) || hour > LAST_GROUP_START) {
      throw new BadRequestException(
        'A aula em grupo dura 1 hora: escolha um início entre 08:00 e 20:00, de meia em meia hora.',
      );
    }

    if (tierId === 'monthly-group') {
      const weeks = fields.weeksOfMonth ?? [];
      const valid =
        weeks.length === 2 &&
        new Set(weeks).size === 2 &&
        weeks.every((week) => Number.isInteger(week) && week >= 1 && week <= 4);
      if (!valid) {
        throw new BadRequestException(
          'O grupo mensal tem dois encontros: escolha duas semanas diferentes do mês, de 1 a 4.',
        );
      }
      if (!fields.founderWeek || !weeks.includes(fields.founderWeek)) {
        throw new BadRequestException(
          'Escolha qual das duas semanas é o encontro com a fundadora.',
        );
      }
    } else if (fields.weeksOfMonth?.length || fields.founderWeek) {
      throw new BadRequestException(
        'O grupo semanal se encontra toda semana: não escolha semanas do mês.',
      );
    }

    const min = fields.minStudents ?? DEFAULT_MIN_STUDENTS;
    const max = fields.maxStudents ?? DEFAULT_MAX_STUDENTS;
    if (min < 1 || max < min) {
      throw new BadRequestException(
        'O mínimo é pelo menos 1, e o máximo não fica abaixo do mínimo.',
      );
    }

    if (
      !isCompatibleStart(
        { tierId, dayOfWeek, weeksOfMonth: fields.weeksOfMonth },
        startDate,
      )
    ) {
      throw new BadRequestException(
        'A data de início precisa ser futura e cair no dia (e, no grupo mensal, numa das semanas) da turma.',
      );
    }
  }

  private async resolveTeacher(
    teacherId: string,
  ): Promise<{ id: string; name: string }> {
    try {
      const teacher = await this.teachers.findById(teacherId);
      return { id: teacher.id!, name: teacher.fullName };
    } catch {
      throw new BadRequestException('Professora não encontrada.');
    }
  }
}

/** "Grupo semanal · terça 19:00". */
export function nameOf(fields: FormingFields): string {
  const tier = fields.tierId ? TIER_LABELS[fields.tierId] : 'Turma';
  const day = DAY_NAMES[fields.dayOfWeek ?? 0];
  return `${tier} · ${day} ${formatSlotHour(fields.hour ?? 0)}`;
}

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
