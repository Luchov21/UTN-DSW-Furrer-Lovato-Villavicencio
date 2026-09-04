import { ChargeOrderResolverAdapter } from './chargeOrder-resolver.adapter';
import { ChargeOrderStatus } from './enum/chargeOrder-status.enum';

describe('ChargeOrderResolverAdapter.resolve', () => {
  let chargeOrders: {
    findByExternalReference: jest.Mock;
    closeAsPaid: jest.Mock;
  };
  let adapter: ChargeOrderResolverAdapter;

  const pendingOrder = {
    id: 1,
    userId: 3,
    planId: 12,
    termMonths: 3,
    method: 'point' as const,
    externalReference: 'flg-user-3-a1b2c3d4',
    amount: 14000,
    status: ChargeOrderStatus.PENDING,
    createdById: 30111222,
  };

  beforeEach(() => {
    chargeOrders = {
      findByExternalReference: jest.fn(),
      closeAsPaid: jest.fn().mockResolvedValue(undefined),
    };
    adapter = new ChargeOrderResolverAdapter(chargeOrders as never);
  });

  it('resolves the purchase intent recorded on the order', async () => {
    chargeOrders.findByExternalReference.mockResolvedValue({
      id: 1,
      userId: 3,
      planId: 12,
      termMonths: 3,
      amount: 14000,
      method: 'point',
      createdById: 30111222,
      status: ChargeOrderStatus.PENDING,
    });

    await expect(adapter.resolve('flg-user-3-a1b2c3d4')).resolves.toEqual({
      userId: 3,
      planId: 12,
      termMonths: 3,
      amount: 14000,
      payMethod: 'point',
      registeredById: 30111222,
    });
  });

  it("labels a webhook-recovered online charge 'mercadopago'", async () => {
    // The same purchase CheckoutService would have recorded synchronously as
    // 'mercadopago'. Writing 'online' here instead would give one sale two
    // different labels in the dashboard's "Método" column depending on which
    // path happened to record it.
    chargeOrders.findByExternalReference.mockResolvedValue({
      ...pendingOrder,
      method: 'online',
      createdById: null,
    });

    await expect(adapter.resolve('flg-user-3-a1b2c3d4')).resolves.toEqual(
      expect.objectContaining({
        payMethod: 'mercadopago',
        registeredById: null,
      }),
    );
  });

  it('returns null when no order matches the external reference', async () => {
    chargeOrders.findByExternalReference.mockResolvedValue(null);

    const result = await adapter.resolve('unknown-ref');

    expect(result).toBeNull();
  });

  it.each([
    ChargeOrderStatus.PAID,
    ChargeOrderStatus.CANCELLED,
    ChargeOrderStatus.EXPIRED,
    ChargeOrderStatus.ERROR,
  ])(
    'returns null for a %s order instead of re-resolving it',
    async (status) => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        ...pendingOrder,
        status,
      });

      const result = await adapter.resolve('flg-user-3-a1b2c3d4');

      expect(result).toBeNull();
    },
  );
});

describe('ChargeOrderResolverAdapter.close', () => {
  let chargeOrders: {
    findByExternalReference: jest.Mock;
    closeAsPaid: jest.Mock;
  };
  let adapter: ChargeOrderResolverAdapter;

  beforeEach(() => {
    chargeOrders = {
      findByExternalReference: jest.fn(),
      closeAsPaid: jest.fn().mockResolvedValue(undefined),
    };
    adapter = new ChargeOrderResolverAdapter(chargeOrders as never);
  });

  it('passes the resulting subscription to closeAsPaid', async () => {
    await adapter.close('flg-user-3-a1b2c3d4', 77, 88);

    expect(chargeOrders.closeAsPaid).toHaveBeenCalledWith(
      'flg-user-3-a1b2c3d4',
      77,
      88,
    );
  });
});
