import { buildReceiptHtml, buildCredentialsHtml } from './receipt.html';

describe('buildReceiptHtml', () => {
  const base = {
    orderId: 123,
    amount: 19995.5,
    dateTime: new Date('2026-09-01T14:30:00Z'),
    payMethod: 'efectivo' as const,
  };

  it('highlights "PAGO EN EFECTIVO" for an efectivo payment', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('COMPROBANTE');
    expect(html).toContain('PAGO EN EFECTIVO');
  });

  it('highlights "PAGO POR TRANSFERENCIA" for a transferencia payment', () => {
    const html = buildReceiptHtml({ ...base, payMethod: 'transferencia' });
    expect(html).toContain('PAGO POR TRANSFERENCIA');
    expect(html).not.toContain('PAGO EN EFECTIVO');
  });

  it('includes the order id and the formatted amount', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('123');
    expect(html).toContain('19.995,50');
  });

  it('includes the cashier line when provided, and omits it otherwise', () => {
    const withCashier = buildReceiptHtml({
      ...base,
      cashier: 'admin@flg.test',
    });
    expect(withCashier).toContain('admin@flg.test');

    const withoutCashier = buildReceiptHtml(base);
    expect(withoutCashier).not.toContain('Caja:');
  });

  it('includes the store name when provided', () => {
    const html = buildReceiptHtml({
      ...base,
      storeName: 'Furrer Lovato Villavicencio',
    });
    expect(html).toContain('Furrer Lovato Villavicencio');
  });

  it('always includes the informational disclaimer', () => {
    const html = buildReceiptHtml(base);
    expect(html).toContain('Comprobante informativo. No válido como factura.');
  });

  it('escapes HTML-unsafe characters in free-text fields', () => {
    const html = buildReceiptHtml({
      ...base,
      cashier: '<script>alert(1)</script>',
      storeName: 'A & B "Gym" <Co>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;Gym&quot; &lt;Co&gt;');
  });
});

describe('buildCredentialsHtml', () => {
  const payload = {
    memberName: 'Rosa Gomez',
    dni: 40123456,
    username: '40123456@presencial.flg',
    password: 'krtm4829',
    planName: 'Full',
    termLabel: '3 meses',
  };

  it('prints both credentials', () => {
    const html = buildCredentialsHtml(payload);
    expect(html).toContain('40123456@presencial.flg');
    expect(html).toContain('krtm4829');
  });

  it('prints the plan and the term when there was a charge', () => {
    const html = buildCredentialsHtml(payload);
    expect(html).toContain('Full');
    expect(html).toContain('3 meses');
  });

  it('omits the plan block when there was no charge', () => {
    const html = buildCredentialsHtml({
      ...payload,
      planName: undefined,
      termLabel: undefined,
    });
    expect(html).not.toContain('Plan:');
  });

  it('escapes a name that contains markup', () => {
    const html = buildCredentialsHtml({
      ...payload,
      memberName: '<script>x</script>',
    });
    expect(html).not.toContain('<script>');
  });

  // That disclaimer belongs to the payment ticket; this is a different
  // document and must not claim to be a receipt.
  it('is not labelled as a comprobante', () => {
    expect(buildCredentialsHtml(payload)).not.toContain('factura');
  });
});
