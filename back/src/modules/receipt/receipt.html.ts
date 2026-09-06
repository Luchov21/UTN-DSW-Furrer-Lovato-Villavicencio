export type ReceiptPayMethod = 'efectivo' | 'transferencia';

export interface ReceiptPayload {
  orderId: number;
  amount: number;
  dateTime: Date;
  payMethod: ReceiptPayMethod;
  cashier?: string;
  storeName?: string;
}

const METHOD_LABEL: Record<ReceiptPayMethod, string> = {
  efectivo: 'PAGO EN EFECTIVO',
  transferencia: 'PAGO POR TRANSFERENCIA',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(dateTime: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dateTime);
}

/**
 * Renders a plain, thermal-receipt-style HTML page for a cash/transfer
 * payment — an informational ticket only, never sent to Mercado Pago as a
 * charge. Meant to be handed to renderReceiptToJpegBuffer for printing on
 * the Point terminal.
 */
export function buildReceiptHtml(payload: ReceiptPayload): string {
  const { orderId, amount, dateTime, payMethod, cashier, storeName } = payload;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    width: 100%;
    padding: 16px 12px;
  }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .title { font-size: 18px; font-weight: bold; letter-spacing: 1px; margin: 8px 0; }
  .method { font-size: 20px; font-weight: bold; margin: 12px 0; }
  .sep {
    border: none;
    border-top: 1px dashed #000;
    margin: 10px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    margin: 4px 0;
  }
  .row .label { font-family: Arial, sans-serif; }
  .row .value { font-family: 'Courier New', monospace; }
  .disclaimer {
    font-size: 11px;
    margin-top: 14px;
    text-align: center;
  }
</style>
</head>
<body>
  ${storeName ? `<div class="center store">${escapeHtml(storeName)}</div>` : ''}
  <div class="center title">COMPROBANTE</div>
  <hr class="sep" />
  <div class="center method">${METHOD_LABEL[payMethod]}</div>
  <hr class="sep" />
  <div class="row"><span class="label">Orden:</span><span class="value">${orderId}</span></div>
  <div class="row"><span class="label">Monto:</span><span class="value">$ ${formatAmount(amount)}</span></div>
  <div class="row"><span class="label">Fecha:</span><span class="value">${formatDateTime(dateTime)}</span></div>
  ${
    cashier
      ? `<div class="row"><span class="label">Caja:</span><span class="value">${escapeHtml(cashier)}</span></div>`
      : ''
  }
  <hr class="sep" />
  <div class="disclaimer">Comprobante informativo. No válido como factura.</div>
</body>
</html>`;
}

export interface CredentialsPayload {
  memberName: string;
  dni: number | null;
  username: string;
  password: string;
  planName?: string;
  termLabel?: string;
  storeName?: string;
}

/**
 * The slip a member is handed at the counter. Same thermal styling as the
 * payment ticket, but a different document: it carries no "comprobante"
 * framing and no factura disclaimer.
 */
export function buildCredentialsHtml(payload: CredentialsPayload): string {
  const { memberName, dni, username, password, planName, termLabel, storeName } =
    payload;

  const planRows =
    planName && termLabel
      ? `<div class="row"><span class="label">Plan:</span><span class="value">${escapeHtml(planName)}</span></div>
  <div class="row"><span class="label">Período:</span><span class="value">${escapeHtml(termLabel)}</span></div>`
      : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000; background: #fff; width: 100%; padding: 16px 12px;
  }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .title { font-size: 18px; font-weight: bold; letter-spacing: 1px; margin: 8px 0; }
  .sep { border: none; border-top: 1px dashed #000; margin: 10px 0; }
  .row { display: flex; justify-content: space-between; font-size: 14px; margin: 4px 0; }
  .row .value { font-family: 'Courier New', monospace; }
  .cred { margin: 10px 0; }
  .cred .label { font-size: 12px; }
  .cred .value {
    font-family: 'Courier New', monospace;
    font-size: 22px; font-weight: bold; letter-spacing: 1px; word-break: break-all;
  }
  .note { font-size: 11px; margin-top: 14px; text-align: center; }
</style>
</head>
<body>
  ${storeName ? `<div class="center store">${escapeHtml(storeName)}</div>` : ''}
  <div class="center title">CREDENCIALES DE ACCESO</div>
  <hr class="sep" />
  <div class="row"><span class="label">Socio:</span><span class="value">${escapeHtml(memberName)}</span></div>
  ${dni != null ? `<div class="row"><span class="label">DNI:</span><span class="value">${dni}</span></div>` : ''}
  ${planRows}
  <hr class="sep" />
  <div class="cred"><div class="label">Usuario</div><div class="value">${escapeHtml(username)}</div></div>
  <div class="cred"><div class="label">Contraseña</div><div class="value">${escapeHtml(password)}</div></div>
  <hr class="sep" />
  <div class="note">Cambiá la contraseña la primera vez que entres a la web.</div>
</body>
</html>`;
}
