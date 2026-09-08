import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { ReceiptPrint } from './entity/receipt-print.entity';
import {
  buildReceiptHtml,
  buildCredentialsHtml,
  type ReceiptPayMethod,
  type CredentialsPayload,
} from './receipt.html';
import { renderReceiptToJpegBuffer } from './receipt.render';
import { MercadoPagoTerminalPrinterClient } from '../mercadopago/mercadopago-printer.client';

export type ReceiptDocumentType = 'payment' | 'credentials';

export interface PrintPaymentReceiptInput {
  paymentId: number;
  amount: number;
  date: Date;
  payMethod: ReceiptPayMethod;
  terminalId: string;
  cashier?: string;
  storeName?: string;
}

export type PrintCredentialsSlipInput = CredentialsPayload & {
  userId: number;
  terminalId: string;
};

export interface PrintPaymentReceiptResult {
  status: 'sent' | 'error';
  errorMessage?: string;
}

// A short blocking window, not the 30-60s a full "wait for finished" cycle
// would take — this runs inside the HTTP request that created the Payment or
// the Users row, and an admin is standing at the counter waiting on it.
export const POLL_INTERVAL_MS = 2000;
export const MAX_POLL_ATTEMPTS = 6;

export type ActionQueueOutcome = 'left_queue' | 'stuck';

export interface ActionQueuePollResult {
  outcome: ActionQueueOutcome;
  lastStatus?: string;
}

/**
 * Polls a just-created terminal action until it leaves Mercado Pago's
 * `created` state (accepted by the API, not yet fetched by the terminal) or
 * the poll budget runs out. A terminal can silently fail to pick up a queued
 * action — confirmed against a real Point Smart on 2026-09-02: the same
 * image printed successfully once, then the identical content, sent again
 * minutes later, sat in `created` forever and the terminal's own "Actualizar"
 * button reported "no hay operaciones para procesar" — Mercado Pago Support
 * calls this a terminal↔server sync issue, not a content/format problem. An
 * action left in `created` blocks every later print with
 * `already_queued_order_on_terminal` until it expires or is cancelled, so
 * this polls briefly and cancels it rather than leaving that trap for the
 * next print. `getStatus` and `sleep` are injected so the retry policy is
 * testable without real timers.
 */
export async function waitForActionToLeaveQueue(
  getStatus: () => Promise<string | undefined>,
  sleep: (ms: number) => Promise<void>,
  pollIntervalMs = POLL_INTERVAL_MS,
  maxAttempts = MAX_POLL_ATTEMPTS,
): Promise<ActionQueuePollResult> {
  let lastStatus: string | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastStatus = await getStatus();
    if (lastStatus && lastStatus !== 'created') {
      return { outcome: 'left_queue', lastStatus };
    }
    if (attempt < maxAttempts - 1) {
      await sleep(pollIntervalMs);
    }
  }
  return { outcome: 'stuck', lastStatus };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders and prints a document on a Point terminal — the informational
 * "cash/transferencia" payment ticket or a member's credentials slip — and
 * logs the attempt for dedupe. Never throws — this is a side effect of an
 * already-persisted row (a Payment or a Users), so a printing failure must
 * never look like that row's creation failed. Callers surface `status` to
 * the admin instead.
 */
@Injectable()
export class ReceiptPrintService {
  private readonly logger = new Logger(ReceiptPrintService.name);

  constructor(
    @InjectRepository(ReceiptPrint)
    private readonly repository: Repository<ReceiptPrint>,
    private readonly printerClient: MercadoPagoTerminalPrinterClient,
  ) {}

  async printPaymentReceipt(
    input: PrintPaymentReceiptInput,
  ): Promise<PrintPaymentReceiptResult> {
    const html = buildReceiptHtml({
      orderId: input.paymentId,
      amount: input.amount,
      dateTime: input.date,
      payMethod: input.payMethod,
      cashier: input.cashier,
      storeName: input.storeName,
    });

    return this.printDocument({
      documentType: 'payment',
      documentId: input.paymentId,
      terminalId: input.terminalId,
      html,
    });
  }

  /**
   * Prints a member's credentials slip. Same never-throws contract as
   * printPaymentReceipt: the account already exists, so a printing failure
   * must never look like the member was not created.
   */
  async printCredentialsSlip(
    input: PrintCredentialsSlipInput,
  ): Promise<PrintPaymentReceiptResult> {
    return this.printDocument({
      documentType: 'credentials',
      documentId: input.userId,
      terminalId: input.terminalId,
      html: buildCredentialsHtml(input),
    });
  }

  private async printDocument({
    documentType,
    documentId,
    terminalId,
    html,
  }: {
    documentType: ReceiptDocumentType;
    documentId: number;
    terminalId: string;
    html: string;
  }): Promise<PrintPaymentReceiptResult> {
    let buffer: Buffer;
    try {
      buffer = await renderReceiptToJpegBuffer(html);
    } catch (err) {
      return this.fail(documentType, documentId, terminalId, '', err);
    }

    const contentHash = createHash('sha256').update(buffer).digest('hex');

    // A retry of the same document (admin double-click, front-end retry)
    // that already produced this exact ticket must not print it twice.
    const alreadySent = await this.repository
      .findOne({
        where: { documentType, documentId, contentHash, status: 'sent' },
      })
      .catch(() => null);
    if (alreadySent) {
      return { status: 'sent' };
    }

    const externalReference = `receipt-${documentType}-${documentId}`;
    const idempotencyKey = randomUUID();

    let actionId: string | null = null;
    let actionStatus: string | null = null;
    try {
      const result = await this.printerClient.printReceiptImage({
        terminalId,
        externalReference,
        idempotencyKey,
        imageBuffer: buffer,
      });
      actionId = result.actionId ?? null;
      actionStatus = result.status ?? null;
    } catch (err) {
      return this.fail(
        documentType,
        documentId,
        terminalId,
        contentHash,
        err,
        externalReference,
        idempotencyKey,
      );
    }

    if (actionId) {
      const currentActionId = actionId;
      const { outcome, lastStatus } = await waitForActionToLeaveQueue(
        async () => {
          try {
            const action = await this.printerClient.getAction(currentActionId);
            return action?.status;
          } catch {
            return undefined;
          }
        },
        sleep,
      );

      if (outcome === 'stuck') {
        await this.printerClient.cancelAction(currentActionId).catch(() => {});
        const errorMessage =
          'La terminal no confirmó la impresión a tiempo. Puede haber un problema de conexión — revisá el equipo e intentá de nuevo.';
        this.logger.warn(
          `Print action ${currentActionId} for ${documentType} ${documentId} stayed queued past the poll window; cancelled.`,
        );
        await this.persist({
          documentType,
          documentId,
          terminalId,
          externalReference,
          idempotencyKey,
          actionId: currentActionId,
          actionStatus: lastStatus ?? 'created',
          contentHash,
          status: 'error',
          errorMessage,
        });
        return { status: 'error', errorMessage };
      }

      actionStatus = lastStatus ?? actionStatus;
    }

    await this.persist({
      documentType,
      documentId,
      terminalId,
      externalReference,
      idempotencyKey,
      actionId,
      actionStatus,
      contentHash,
      status: 'sent',
      errorMessage: null,
    });
    return { status: 'sent' };
  }

  private async fail(
    documentType: ReceiptDocumentType,
    documentId: number,
    terminalId: string,
    contentHash: string,
    err: unknown,
    externalReference = `receipt-${documentType}-${documentId}`,
    idempotencyKey = randomUUID(),
  ): Promise<PrintPaymentReceiptResult> {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `Failed to print receipt for ${documentType} ${documentId}: ${errorMessage}`,
    );
    await this.persist({
      documentType,
      documentId,
      terminalId,
      externalReference,
      idempotencyKey,
      actionId: null,
      actionStatus: null,
      contentHash,
      status: 'error',
      errorMessage,
    });
    return { status: 'error', errorMessage };
  }

  private async persist(row: {
    documentType: ReceiptDocumentType;
    documentId: number;
    terminalId: string;
    externalReference: string;
    idempotencyKey: string;
    actionId: string | null;
    actionStatus: string | null;
    contentHash: string;
    status: 'sent' | 'error';
    errorMessage: string | null;
  }): Promise<void> {
    try {
      await this.repository.save(
        this.repository.create({ ...row, createdAt: new Date() }),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to persist receipt print record for ${row.documentType} ${row.documentId}: ${detail}`,
      );
    }
  }
}
