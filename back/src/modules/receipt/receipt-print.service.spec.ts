import {
  ReceiptPrintService,
  waitForActionToLeaveQueue,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from './receipt-print.service';
import { MercadoPagoTerminalPrinterClient } from '../mercadopago/mercadopago-printer.client';
import { renderReceiptToJpegBuffer } from './receipt.render';

jest.mock('./receipt.render', () => ({
  renderReceiptToJpegBuffer: jest.fn(),
}));

const mockedRender = renderReceiptToJpegBuffer as jest.Mock;

describe('ReceiptPrintService.printPaymentReceipt', () => {
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let printerClient: {
    printReceiptImage: jest.Mock;
    getAction: jest.Mock;
    cancelAction: jest.Mock;
  };
  let service: ReceiptPrintService;

  const input = {
    paymentId: 42,
    amount: 19995,
    date: new Date('2026-09-01T14:30:00Z'),
    payMethod: 'efectivo' as const,
    terminalId: 'terminal-1',
    cashier: 'admin@flg.test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    printerClient = {
      printReceiptImage: jest.fn(),
      // Defaults to "already left the queue" so the watchdog exits on its
      // first check with no sleep — tests that don't care about the
      // watchdog stay fast. Only the watchdog-specific tests override this.
      getAction: jest.fn().mockResolvedValue({ status: 'processed' }),
      cancelAction: jest.fn().mockResolvedValue(undefined),
    };
    mockedRender.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    service = new ReceiptPrintService(
      repository as never,
      printerClient as unknown as MercadoPagoTerminalPrinterClient,
    );
  });

  it('prints and persists a "sent" row on the happy path, including Mercado Pago\'s action id', async () => {
    printerClient.printReceiptImage.mockResolvedValue({
      idempotencyKey: 'idem-1',
      actionId: 'action-1',
      status: 'created',
      responseBody: { id: 'action-1', status: 'created' },
    });

    const result = await service.printPaymentReceipt(input);

    expect(result).toEqual({ status: 'sent' });
    expect(printerClient.printReceiptImage).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalId: 'terminal-1',
        externalReference: 'receipt-payment-42',
        imageBuffer: Buffer.from('fake-jpeg-bytes'),
      }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'payment',
        documentId: 42,
        status: 'sent',
        externalReference: 'receipt-payment-42',
        actionId: 'action-1',
        actionStatus: 'processed',
      }),
    );
    expect(printerClient.getAction).toHaveBeenCalledWith('action-1');
  });

  it('never sends PII in externalReference', async () => {
    printerClient.printReceiptImage.mockResolvedValue({
      idempotencyKey: 'idem-1',
      responseBody: {},
    });

    await service.printPaymentReceipt(input);

    const calls = printerClient.printReceiptImage.mock.calls as Array<
      [{ externalReference: string }]
    >;
    const [call] = calls[0];
    expect(call.externalReference).not.toMatch(/admin@flg\.test/);
    expect(call.externalReference).toBe('receipt-payment-42');
  });

  it('skips a re-print when the same ticket already printed successfully', async () => {
    repository.findOne.mockResolvedValue({
      id: 5,
      documentType: 'payment',
      documentId: 42,
      status: 'sent',
    });

    const result = await service.printPaymentReceipt(input);

    expect(result).toEqual({ status: 'sent' });
    expect(printerClient.printReceiptImage).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('dedupes on the document identity, not the payment alone', async () => {
    repository.findOne.mockResolvedValue({ id: 1, status: 'sent' });

    await service.printPaymentReceipt(input);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        documentType: 'payment',
        documentId: 42,
        contentHash: expect.any(String),
        status: 'sent',
      },
    });
  });

  it('builds an external reference that carries no PII', async () => {
    await service.printPaymentReceipt(input);

    const [call] = printerClient.printReceiptImage.mock.calls as [
      [{ externalReference: string }],
    ];
    expect(call[0].externalReference).toBe('receipt-payment-42');
  });

  it('persists an "error" row and returns it when rendering fails, without calling the printer', async () => {
    mockedRender.mockRejectedValue(new Error('chromium crashed'));

    const result = await service.printPaymentReceipt(input);

    expect(result).toEqual({
      status: 'error',
      errorMessage: 'chromium crashed',
    });
    expect(printerClient.printReceiptImage).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'payment',
        documentId: 42,
        status: 'error',
        errorMessage: 'chromium crashed',
      }),
    );
  });

  it('persists an "error" row and returns it when the terminal call fails', async () => {
    printerClient.printReceiptImage.mockRejectedValue(
      new Error(
        'Mercado Pago terminal print failed (status=400): bad terminal',
      ),
    );

    const result = await service.printPaymentReceipt(input);

    expect(result).toEqual({
      status: 'error',
      errorMessage:
        'Mercado Pago terminal print failed (status=400): bad terminal',
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'payment',
        documentId: 42,
        status: 'error',
        actionId: null,
      }),
    );
  });

  it('never throws, even when both rendering and persistence fail', async () => {
    mockedRender.mockRejectedValue(new Error('render exploded'));
    repository.save.mockRejectedValue(new Error('db down'));

    await expect(service.printPaymentReceipt(input)).resolves.toBeDefined();
  });

  // Confirmed against a real Point Smart on 2026-09-02: an accepted print
  // action can sit in `created` forever — the terminal never fetches it, and
  // pressing its own "Actualizar" button reported nothing pending. Left
  // alone, that action blocks every later print with
  // `already_queued_order_on_terminal`.
  it('cancels an action that never leaves the queue and persists an error, without throwing', async () => {
    jest.useFakeTimers();
    try {
      printerClient.printReceiptImage.mockResolvedValue({
        idempotencyKey: 'idem-1',
        actionId: 'stuck-action',
        status: 'created',
        responseBody: {},
      });
      printerClient.getAction.mockResolvedValue({ status: 'created' });

      const resultPromise = service.printPaymentReceipt(input);
      for (let i = 0; i < MAX_POLL_ATTEMPTS - 1; i += 1) {
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      }
      const result = await resultPromise;

      expect(result.status).toBe('error');
      expect(printerClient.getAction).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS);
      expect(printerClient.cancelAction).toHaveBeenCalledWith('stuck-action');
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: 'payment',
          documentId: 42,
          status: 'error',
          actionId: 'stuck-action',
          actionStatus: 'created',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('waitForActionToLeaveQueue (retry/cancel policy)', () => {
  const instantSleep = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    instantSleep.mockClear();
  });

  it('returns immediately once the status leaves "created"', async () => {
    const getStatus = jest.fn().mockResolvedValue('processed');

    const result = await waitForActionToLeaveQueue(getStatus, instantSleep, 10, 5);

    expect(result).toEqual({ outcome: 'left_queue', lastStatus: 'processed' });
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(instantSleep).not.toHaveBeenCalled();
  });

  it('keeps polling while the status stays "created", then reports "stuck"', async () => {
    const getStatus = jest.fn().mockResolvedValue('created');

    const result = await waitForActionToLeaveQueue(getStatus, instantSleep, 10, 4);

    expect(result).toEqual({ outcome: 'stuck', lastStatus: 'created' });
    expect(getStatus).toHaveBeenCalledTimes(4);
    expect(instantSleep).toHaveBeenCalledTimes(3);
  });

  it('treats an undefined status (a failed lookup) the same as still-queued', async () => {
    const getStatus = jest.fn().mockResolvedValue(undefined);

    const result = await waitForActionToLeaveQueue(getStatus, instantSleep, 10, 2);

    expect(result).toEqual({ outcome: 'stuck', lastStatus: undefined });
  });

  it('stops polling as soon as the status changes, even mid-window', async () => {
    const getStatus = jest
      .fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('on_terminal');

    const result = await waitForActionToLeaveQueue(getStatus, instantSleep, 10, 6);

    expect(result).toEqual({ outcome: 'left_queue', lastStatus: 'on_terminal' });
    expect(getStatus).toHaveBeenCalledTimes(3);
    expect(instantSleep).toHaveBeenCalledTimes(2);
  });
});

describe('ReceiptPrintService.printCredentialsSlip', () => {
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let printerClient: {
    printReceiptImage: jest.Mock;
    getAction: jest.Mock;
    cancelAction: jest.Mock;
  };
  let service: ReceiptPrintService;

  const input = {
    userId: 7,
    memberName: 'Rosa Gomez',
    dni: 40123456,
    username: '40123456@presencial.flg',
    password: 'krtm4829',
    terminalId: 'terminal-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    printerClient = {
      printReceiptImage: jest.fn(),
      // Defaults to "already left the queue" so the watchdog exits on its
      // first check with no sleep — tests that don't care about the
      // watchdog stay fast. Only the watchdog-specific tests override this.
      getAction: jest.fn().mockResolvedValue({ status: 'processed' }),
      cancelAction: jest.fn().mockResolvedValue(undefined),
    };
    mockedRender.mockResolvedValue(Buffer.from('fake-jpeg-bytes'));
    service = new ReceiptPrintService(
      repository as never,
      printerClient as unknown as MercadoPagoTerminalPrinterClient,
    );
  });

  it('builds an external reference keyed on the user, not the payment', async () => {
    printerClient.printReceiptImage.mockResolvedValue({
      idempotencyKey: 'idem-1',
      responseBody: {},
    });

    const result = await service.printCredentialsSlip(input);

    expect(result).toEqual({ status: 'sent' });
    expect(printerClient.printReceiptImage).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'receipt-credentials-7' }),
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'credentials',
        documentId: 7,
        status: 'sent',
      }),
    );
  });
});
