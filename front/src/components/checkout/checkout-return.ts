// Mercado Pago appends status, collection_status, payment_id and
// external_reference to the back_urls it returns a member to. Only the
// reference is read, and only as an opaque key to ask our own backend what
// happened. Deciding from `status` would mean /checkout/return?status=approved
// granting a membership to anyone who types it.

/** Mirrors buildExternalReference on the backend. */
const REFERENCE_PATTERN = /^flg-user-\d+-[a-f0-9]{8}$/;

export const POLL_INTERVAL_MS = 2000;
/** ~30 seconds. Past this the member is told the receipt will arrive by email. */
export const POLL_ATTEMPTS = 15;

export function readReturnReference(search: string): string | null {
  const value = new URLSearchParams(search).get('external_reference');
  return value && REFERENCE_PATTERN.test(value) ? value : null;
}
