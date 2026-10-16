import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccessGrantDto } from './AccessGrant.dto';

/** Spec 026: `amount` obrigatório ao conceder (Sprint 9); `refund` decidido pelo service. */
async function errorsOf(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(AccessGrantDto, body));
  return errors.map((error) => error.property);
}

describe('AccessGrantDto', () => {
  it('conceder sem valor é recusado (Sprint 9)', async () => {
    await expect(errorsOf({ active: true })).resolves.toEqual(['amount']);
  });

  it('revogar só com active passa no DTO — o refund é conferido no service', async () => {
    await expect(errorsOf({ active: false })).resolves.toEqual([]);
  });

  it('aceita valor com até 2 casas e zero (cortesia)', async () => {
    await expect(errorsOf({ active: true, amount: 199.9 })).resolves.toEqual(
      [],
    );
    await expect(errorsOf({ active: true, amount: 0 })).resolves.toEqual([]);
  });

  it('recusa valor negativo ou com 3 casas', async () => {
    await expect(errorsOf({ active: true, amount: -1 })).resolves.toEqual([
      'amount',
    ]);
    await expect(errorsOf({ active: true, amount: 10.005 })).resolves.toEqual([
      'amount',
    ]);
  });

  it('aceita refund booleano e recusa outro tipo', async () => {
    await expect(errorsOf({ active: false, refund: true })).resolves.toEqual(
      [],
    );
    await expect(errorsOf({ active: false, refund: 'sim' })).resolves.toEqual([
      'refund',
    ]);
  });
});
