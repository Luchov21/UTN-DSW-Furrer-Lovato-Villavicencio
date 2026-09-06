import { MercadoPagoConfig } from './mercadopago.config';
import { MercadoPagoTerminalPrinterClient } from './mercadopago-printer.client';
import { MercadoPagoUnavailableError } from './mercadopago.client';

const configOf = (env: Record<string, string | undefined>) =>
  new MercadoPagoConfig({ get: (k: string) => env[k] } as never);

const ENABLED_ENV = {
  MP_ENABLED: 'true',
  MP_ACCESS_TOKEN: 'fake-access-token-for-tests',
  MP_PUBLIC_KEY: 'fake-public-key-for-tests',
  MP_WEBHOOK_SECRET: 'secret',
};

describe('MercadoPagoTerminalPrinterClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refuses to print when Mercado Pago is disabled', async () => {
    const client = new MercadoPagoTerminalPrinterClient(configOf({}));

    await expect(
      client.printReceiptImage({
        terminalId: 'terminal-1',
        externalReference: 'receipt-payment-1',
        idempotencyKey: 'idem-key-1',
        imageBuffer: Buffer.from('img'),
      }),
    ).rejects.toThrow(MercadoPagoUnavailableError);
  });

  it('refuses to send an image larger than 1MB', async () => {
    const client = new MercadoPagoTerminalPrinterClient(configOf(ENABLED_ENV));
    const oversized = Buffer.alloc(1_000_001, 1);

    await expect(
      client.printReceiptImage({
        terminalId: 'terminal-1',
        externalReference: 'receipt-payment-1',
        idempotencyKey: 'idem-key-1',
        imageBuffer: oversized,
      }),
    ).rejects.toThrow(/1\s*MB/);
  });

  it('POSTs a print action with the required headers and a pure-base64 body', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'action-1', status: 'sent' }),
    });
    global.fetch = fetchMock;

    const client = new MercadoPagoTerminalPrinterClient(configOf(ENABLED_ENV));
    const imageBuffer = Buffer.from('fake-jpeg-bytes');

    const result = await client.printReceiptImage({
      terminalId: 'terminal-1',
      externalReference: 'receipt-payment-42',
      idempotencyKey: 'caller-supplied-idem-key',
      imageBuffer,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mercadopago.com/terminals/v1/actions');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ENABLED_ENV.MP_ACCESS_TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    // The caller's key is forwarded verbatim, not regenerated — the caller
    // owns idempotency because it also owns what gets persisted on failure.
    expect(headers['X-Idempotency-Key']).toBe('caller-supplied-idem-key');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'print',
      external_reference: 'receipt-payment-42',
      config: { point: { terminal_id: 'terminal-1', subtype: 'image' } },
    });
    // Pure base64, no data:image/...;base64, prefix.
    expect(body.content).toBe(imageBuffer.toString('base64'));
    expect(body.content).not.toMatch(/^data:/);

    expect(result).toEqual({
      idempotencyKey: 'caller-supplied-idem-key',
      actionId: 'action-1',
      status: 'sent',
      responseBody: { id: 'action-1', status: 'sent' },
    });
  });

  it('throws a clear error when Mercado Pago responds with a non-2xx status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"message":"invalid terminal_id"}'),
    });

    const client = new MercadoPagoTerminalPrinterClient(configOf(ENABLED_ENV));

    await expect(
      client.printReceiptImage({
        terminalId: 'bad-terminal',
        externalReference: 'receipt-payment-1',
        idempotencyKey: 'idem-key-1',
        imageBuffer: Buffer.from('img'),
      }),
    ).rejects.toThrow(/400/);
  });

  describe('getAction', () => {
    it('GETs an action by id and normalizes its status', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'action-1',
            status: 'created',
            status_detail: 'created',
          }),
      });
      global.fetch = fetchMock;

      const client = new MercadoPagoTerminalPrinterClient(
        configOf(ENABLED_ENV),
      );
      const action = await client.getAction('action-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.mercadopago.com/terminals/v1/actions/action-1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(action).toEqual({
        id: 'action-1',
        status: 'created',
        statusDetail: 'created',
      });
    });

    it('throws a clear error when the action cannot be found', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"errors":[{"code":"order_not_found"}]}'),
      });

      const client = new MercadoPagoTerminalPrinterClient(
        configOf(ENABLED_ENV),
      );

      await expect(client.getAction('missing-action')).rejects.toThrow(/404/);
    });
  });

  describe('cancelAction', () => {
    it('POSTs a cancel request for an action still in "created" status', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'action-1', status: 'canceled' }),
      });
      global.fetch = fetchMock;

      const client = new MercadoPagoTerminalPrinterClient(
        configOf(ENABLED_ENV),
      );
      await client.cancelAction('action-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://api.mercadopago.com/terminals/v1/actions/action-1/cancel',
      );
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(
        `Bearer ${ENABLED_ENV.MP_ACCESS_TOKEN}`,
      );
      expect(headers['X-Idempotency-Key']).toBeTruthy();
    });

    it('throws a clear error when the action can no longer be canceled', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: () =>
          Promise.resolve('{"errors":[{"code":"invalid_action_status"}]}'),
      });

      const client = new MercadoPagoTerminalPrinterClient(
        configOf(ENABLED_ENV),
      );

      await expect(client.cancelAction('action-1')).rejects.toThrow(/409/);
    });
  });
});
