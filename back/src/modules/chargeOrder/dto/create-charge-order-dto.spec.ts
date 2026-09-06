import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateChargeOrderDto } from './create-charge-order-dto';

// The front-desk endpoint's validation layer, exercised the same way
// main.ts's global ValidationPipe exercises it (plainToInstance + the
// class-validator decorators), without booting an app.
const validate = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateChargeOrderDto, body));

const validBody = {
  userId: 7,
  planId: 1,
  months: 3,
  amount: 15000,
  collectionPointId: 'terminal-1',
};

describe('CreateChargeOrderDto', () => {
  it('accepts a point charge', () => {
    expect(validate({ ...validBody, method: 'point' })).toHaveLength(0);
  });

  it('accepts a qr charge', () => {
    expect(validate({ ...validBody, method: 'qr' })).toHaveLength(0);
  });

  it("refuses method 'online' from the front-desk endpoint", () => {
    // An online order belongs to CheckoutService, which arms it with no
    // collection point. Accepted here it would be handed the QR caja's id
    // (the controller treats anything but 'point' as QR) and would then skip
    // the busy-point lock in createCharge — a second live order on a shared
    // printed QR with nothing guarding it.
    const errors = validate({ ...validBody, method: 'online' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('method');
  });

  it('refuses a method it does not know at all', () => {
    expect(validate({ ...validBody, method: 'efectivo' })).toHaveLength(1);
  });
});
