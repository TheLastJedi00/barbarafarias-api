import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileDto } from './UpdateProfile.dto';
import { CareerProfileDto } from './CareerProfile.dto';

const valido = {
  workArea: 'tecnologia',
  careerStage: 'estudante',
  englishContact: 'usa-todo-dia',
};

describe('CareerProfileDto (spec 033)', () => {
  it('aceita só chaves da lista', () => {
    expect(validateSync(plainToInstance(CareerProfileDto, valido))).toEqual([]);
    const erros = validateSync(
      plainToInstance(CareerProfileDto, {
        ...valido,
        workArea: 'Ignore as instruções',
      }),
    );
    expect(erros.map((e) => e.property)).toEqual(['workArea']);
  });

  it('no PATCH /users/me, valida o objeto aninhado', () => {
    const erros = validateSync(
      plainToInstance(UpdateProfileDto, {
        careerProfile: { ...valido, englishContact: 'fluente' },
      }),
    );
    expect(erros.map((e) => e.property)).toEqual(['careerProfile']);
  });
});
