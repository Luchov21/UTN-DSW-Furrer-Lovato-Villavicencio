/**
 * Thirty minutes. The window in which a preference created on the wallet
 * page can still be paid. It exists because the ChargeOrder backing a
 * preference is armed at submit time, not at creation time (see the spec's
 * D4): a preference paid before it was armed resolves against nothing, and
 * the webhook can only log the reference for a human to reconcile. Expiry
 * bounds how long that window stays open.
 */
export const PREFERENCE_EXPIRATION_MS = 30 * 60 * 1000;

export interface PreferenceBodyInput {
  planName: string;
  /** Resolved by the server from the plan and term. Never client-supplied. */
  amount: number;
  externalReference: string;
  payerEmail: string;
  /** The public origin the member's browser can reach, for back_urls. */
  frontendUrl: string;
  now: Date;
}

export interface PreferenceBody {
  purpose: 'wallet_purchase';
  items: {
    title: string;
    quantity: number;
    unit_price: number;
    currency_id: 'ARS';
  }[];
  external_reference: string;
  payer: { email: string };
  payment_methods: {
    installments: number;
    excluded_payment_types: { id: string }[];
  };
  back_urls: { success: string; pending: string; failure: string };
  auto_return: 'approved';
  expires: boolean;
  expiration_date_to: string;
}

/**
 * The Mercado Pago preference behind the Payment Brick's "Mercado Pago"
 * option. Pure, so every rule that matters — the price the server chose, the
 * reference the webhook resolves on, the excluded cash rails, the single
 * installment — is assertable without an SDK or a network.
 *
 * `purpose: 'wallet_purchase'` means the payer must log into their Mercado
 * Pago account; omitting it would let guests pay, which this flow cannot
 * accept because the ChargeOrder is keyed to a member.
 */
export function buildPreferenceBody(
  input: PreferenceBodyInput,
): PreferenceBody {
  // A configured FRONTEND_URL with a trailing slash would otherwise produce
  // '…//checkout/return', which Mercado Pago accepts and the browser resolves
  // to a different path than the router registers.
  const origin = input.frontendUrl.replace(/\/+$/, '');
  const returnUrl = `${origin}/checkout/return`;

  return {
    purpose: 'wallet_purchase',
    items: [
      {
        title: `Membresía FLG — ${input.planName}`,
        quantity: 1,
        unit_price: input.amount,
        currency_id: 'ARS',
      },
    ],
    external_reference: input.externalReference,
    payer: { email: input.payerEmail },
    payment_methods: {
      installments: 1,
      // Cash is excluded here as well as on the Brick: the Brick's
      // customization governs our page, this governs Mercado Pago's.
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
    },
    back_urls: {
      success: returnUrl,
      pending: returnUrl,
      failure: returnUrl,
    },
    auto_return: 'approved',
    // `expires` is what makes `expiration_date_to` take effect; the date
    // alone is ignored.
    expires: true,
    expiration_date_to: new Date(
      input.now.getTime() + PREFERENCE_EXPIRATION_MS,
    ).toISOString(),
  };
}
