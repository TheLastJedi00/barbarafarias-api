import { ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { isValidSlotHour } from './slot-time';

/**
 * Barra horas como 8.25: a operação só existe em passos de 30 minutos
 * (spec 011 RF4).
 *
 * Mora em `common/` porque três módulos precisam da mesma regra — agenda
 * (`AssignSlotDto`), reagendamento (`CreateRescheduleDto`) e slot de reposição
 * (`WeeklySlotDto`). Enquanto vivia dentro do DTO da agenda, os outros dois
 * ficaram para trás na migração da grade decimal e recusavam meia-hora.
 */
@ValidatorConstraint({ name: 'isHalfHourStep', async: false })
export class IsHalfHourStep implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'number' && isValidSlotHour(value);
  }

  defaultMessage(): string {
    return 'hour deve estar em passos de 30 minutos (ex.: 8, 8.5, 9)';
  }
}
