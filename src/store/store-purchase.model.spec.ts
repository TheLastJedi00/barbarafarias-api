import { isPurchaseActive } from './store-purchase.model';

describe('isPurchaseActive (spec 032 §4)', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');

  it('PAID dentro da validade dá acesso', () => {
    expect(
      isPurchaseActive(
        { status: 'PAID', accessUntil: '2027-02-14T12:00:00.000Z' },
        now,
      ),
    ).toBe(true);
  });

  it('vencida não dá acesso', () => {
    expect(
      isPurchaseActive(
        { status: 'PAID', accessUntil: '2026-11-16T11:59:59.000Z' },
        now,
      ),
    ).toBe(false);
  });

  it.each(['PENDING', 'REFUNDED', 'CHARGED_BACK', 'CANCELLED'] as const)(
    '%s não dá acesso, mesmo com validade no futuro',
    (status) => {
      expect(
        isPurchaseActive(
          { status, accessUntil: '2027-01-01T00:00:00.000Z' },
          now,
        ),
      ).toBe(false);
    },
  );

  it('PAID sem accessUntil não dá acesso', () => {
    expect(isPurchaseActive({ status: 'PAID' }, now)).toBe(false);
  });
});
