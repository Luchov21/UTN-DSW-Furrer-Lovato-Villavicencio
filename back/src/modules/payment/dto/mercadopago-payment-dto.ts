// Shape consumed by PaymentService.createFromMercadoPago. Never bound from an
// HTTP request body directly — it is only ever constructed internally, by the
// webhook handler or the renewal cron, once they've already validated
// whatever Mercado Pago sent them. No class-validator decorators needed here
// for that reason.
export class MercadoPagoPaymentDto {
  mpPaymentId!: string;
  subscriptionId!: number;
  amount!: number;
  termMonths!: number;
  // 'mercadopago' | 'point' | 'qr' depending on which flow produced this
  // payment — not hardcoded here since the caller already knows which.
  payMethod!: string;
  registeredById?: number | null;
  mpOrderId?: string | null;
}
