import { describe, expect, it } from 'vitest';
import { declineMessage, FALLBACK_DECLINE_MESSAGE } from './checkout-messages';

describe('declineMessage', () => {
  it('names insufficient funds', () => {
    expect(declineMessage('cc_rejected_insufficient_amount')).toContain(
      'fondos suficientes',
    );
  });

  it('names a bad security code', () => {
    expect(declineMessage('cc_rejected_bad_filled_security_code')).toContain(
      'código de seguridad',
    );
  });

  it('falls back for a code it does not know', () => {
    expect(declineMessage('cc_rejected_something_new_in_2027')).toBe(
      FALLBACK_DECLINE_MESSAGE,
    );
  });

  it('falls back when there is no code at all', () => {
    expect(declineMessage(undefined)).toBe(FALLBACK_DECLINE_MESSAGE);
  });

  it('never returns an empty string', () => {
    const codes = [
      'cc_rejected_insufficient_amount',
      'cc_rejected_bad_filled_security_code',
      'cc_rejected_bad_filled_date',
      'cc_rejected_bad_filled_card_number',
      'cc_rejected_bad_filled_other',
      'cc_rejected_call_for_authorize',
      'cc_rejected_card_disabled',
      'cc_rejected_card_error',
      'cc_rejected_duplicated_payment',
      'cc_rejected_high_risk',
      'cc_rejected_max_attempts',
      'cc_rejected_blacklist',
      '',
    ];

    codes.forEach((code) => expect(declineMessage(code).length).toBeGreaterThan(0));
  });
});
