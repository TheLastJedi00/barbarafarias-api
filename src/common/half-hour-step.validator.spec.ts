// Os DTOs usam decorators com metadados; fora do runtime do Nest o polyfill
// precisa entrar antes deles.
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRescheduleDto } from '../reschedules/dto/create-reschedule.dto';
import { WeeklySlotDto } from '../teachers/dto/AssignStudents.dto';
import { AssignSlotDto } from '../agenda/dto/assign-slot.dto';
import { REASON_TYPES } from '../reschedules/reschedule.entity';

/**
 * A grade decimal (spec 011 RF4) nasceu na agenda e os outros dois DTOs
 * ficaram para trás — remarcar às 08:30 devolvia 400. Estes testes prendem os
 * três à mesma regra.
 */
describe('grade de 30 minutos nos DTOs de horário', () => {
  async function errorsFor(dto: object): Promise<string[]> {
    const result = await validate(dto as never);
    return result.flatMap((error) => Object.keys(error.constraints ?? {}));
  }

  describe('CreateRescheduleDto.proposedHour', () => {
    const base = {
      proposedDate: '2026-08-10',
      reasonType: REASON_TYPES.SAUDE,
    };

    it.each([8, 8.5, 15.5, 20, 20.5])('aceita %s', async (proposedHour) => {
      const dto = plainToInstance(CreateRescheduleDto, { ...base, proposedHour });
      expect(await errorsFor(dto)).toHaveLength(0);
    });

    it.each([7.5, 8.25, 21, 20.75])('recusa %s', async (proposedHour) => {
      const dto = plainToInstance(CreateRescheduleDto, { ...base, proposedHour });
      expect(await errorsFor(dto)).not.toHaveLength(0);
    });
  });

  describe('WeeklySlotDto.hour (slot de reposição)', () => {
    it('aceita a meia-hora', async () => {
      const dto = plainToInstance(WeeklySlotDto, { dayOfWeek: 3, hour: 14.5 });
      expect(await errorsFor(dto)).toHaveLength(0);
    });

    it('aceita 20:30, último início da grade', async () => {
      const dto = plainToInstance(WeeklySlotDto, { dayOfWeek: 3, hour: 20.5 });
      expect(await errorsFor(dto)).toHaveLength(0);
    });

    it('recusa quarto de hora', async () => {
      const dto = plainToInstance(WeeklySlotDto, { dayOfWeek: 3, hour: 14.25 });
      expect(await errorsFor(dto)).not.toHaveLength(0);
    });
  });

  describe('AssignSlotDto.hour (agenda, já migrado)', () => {
    it('continua aceitando a meia-hora', async () => {
      const dto = plainToInstance(AssignSlotDto, {
        dayOfWeek: 1,
        hour: 9.5,
        occupantType: 'student',
        studentId: 's1',
        studentName: 'Léo',
      });
      expect(await errorsFor(dto)).toHaveLength(0);
    });
  });
});
