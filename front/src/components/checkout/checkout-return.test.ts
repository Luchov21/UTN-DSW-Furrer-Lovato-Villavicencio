import { describe, expect, it } from 'vitest';
import { readReturnReference } from './checkout-return';

describe('readReturnReference', () => {
  it('reads the external reference Mercado Pago appends', () => {
    expect(
      readReturnReference(
        '?collection_status=approved&external_reference=flg-user-7-a1b2c3d4',
      ),
    ).toBe('flg-user-7-a1b2c3d4');
  });

  it('refuses a reference that is not ours', () => {
    expect(readReturnReference('?external_reference=../../admin')).toBeNull();
  });

  it('returns null when there is no reference to poll on', () => {
    expect(readReturnReference('?status=approved')).toBeNull();
  });
});
