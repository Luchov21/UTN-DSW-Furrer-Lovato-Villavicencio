// How a charge order is collected. 'point' targets a card terminal and 'qr' a
// shared printed code (a "caja"); for both, collectionPointId holds the
// terminal id or the external_pos_id. 'online' is the member paying for
// themselves from the checkout — no physical collection point exists, so
// collectionPointId is null and the busy-point lock does not apply to it.
export enum ChargeOrderMethod {
  POINT = 'point',
  QR = 'qr',
  ONLINE = 'online',
}
