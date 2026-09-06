import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ReceiptPrintService } from '../receipt/receipt-print.service';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';
import { buildAuthzApp, tokenFor } from '../../auth/testing/authz-harness';

describe('PaymentController — receipt printing', () => {
  let app: INestApplication;
  let paymentService: {
    createManualPayment: jest.Mock;
    registerPlanPayment: jest.Mock;
  };
  let receiptPrintService: { printPaymentReceipt: jest.Mock };
  let mercadoPagoConfig: {
    enabled: boolean;
    pointTerminalId: string | undefined;
  };

  const savedPayment = {
    id: 42,
    subscriptionId: 7,
    amount: 19995,
    date: new Date('2026-09-01T14:30:00Z'),
    payMethod: 'efectivo',
    state: 'completado',
    registeredById: 40000001,
    termMonths: 1,
    monthlyPriceAtPurchase: 19995,
    deleted: false,
  };

  beforeAll(async () => {
    paymentService = {
      createManualPayment: jest.fn(),
      registerPlanPayment: jest.fn(),
    };
    receiptPrintService = { printPaymentReceipt: jest.fn() };
    mercadoPagoConfig = { enabled: true, pointTerminalId: 'terminal-1' };

    app = await buildAuthzApp(PaymentController, [
      { provide: PaymentService, useValue: paymentService },
      { provide: ReceiptPrintService, useValue: receiptPrintService },
      {
        provide: MercadoPagoConfig,
        useValue: mercadoPagoConfig as unknown as Record<string, jest.Mock>,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mercadoPagoConfig.enabled = true;
    mercadoPagoConfig.pointTerminalId = 'terminal-1';
  });

  describe('POST /api/v1/Payment/manual', () => {
    it('prints a receipt and reports printStatus when paid in efectivo', async () => {
      paymentService.createManualPayment.mockResolvedValue(savedPayment);
      receiptPrintService.printPaymentReceipt.mockResolvedValue({
        status: 'sent',
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/manual')
        .set('Authorization', `Bearer ${tokenFor('admin', 40000001)}`)
        .send({ subscriptionId: 7, amount: 19995, payMethod: 'efectivo' })
        .expect(201);

      expect(receiptPrintService.printPaymentReceipt).toHaveBeenCalledWith({
        paymentId: 42,
        amount: 19995,
        date: savedPayment.date,
        payMethod: 'efectivo',
        terminalId: 'terminal-1',
        cashier: 'admin@flg.test',
      });
      expect(response.body).toMatchObject({ id: 42, printStatus: 'sent' });
    });

    it('prints a receipt for a transferencia payment too', async () => {
      paymentService.createManualPayment.mockResolvedValue({
        ...savedPayment,
        payMethod: 'transferencia',
      });
      receiptPrintService.printPaymentReceipt.mockResolvedValue({
        status: 'sent',
      });

      await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/manual')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ subscriptionId: 7, amount: 19995, payMethod: 'transferencia' })
        .expect(201);

      expect(receiptPrintService.printPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ payMethod: 'transferencia' }),
      );
    });

    it('does not print for a debito or credito payment', async () => {
      paymentService.createManualPayment.mockResolvedValue({
        ...savedPayment,
        payMethod: 'debito',
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/manual')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ subscriptionId: 7, amount: 19995, payMethod: 'debito' })
        .expect(201);

      expect(receiptPrintService.printPaymentReceipt).not.toHaveBeenCalled();
      expect(
        (response.body as { printStatus?: string }).printStatus,
      ).toBeUndefined();
    });

    it('reports printStatus "not_configured" without calling the print service when no terminal is set up', async () => {
      mercadoPagoConfig.pointTerminalId = undefined;
      paymentService.createManualPayment.mockResolvedValue(savedPayment);

      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/manual')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ subscriptionId: 7, amount: 19995, payMethod: 'efectivo' })
        .expect(201);

      expect(receiptPrintService.printPaymentReceipt).not.toHaveBeenCalled();
      expect(response.body).toMatchObject({ printStatus: 'not_configured' });
    });

    it('still returns 201 with the saved payment and a printStatus/printError when printing fails', async () => {
      paymentService.createManualPayment.mockResolvedValue(savedPayment);
      receiptPrintService.printPaymentReceipt.mockResolvedValue({
        status: 'error',
        errorMessage: 'terminal offline',
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/manual')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send({ subscriptionId: 7, amount: 19995, payMethod: 'efectivo' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: 42,
        printStatus: 'error',
        printError: 'terminal offline',
      });
    });
  });

  describe('POST /api/v1/Payment/checkout', () => {
    it('prints a receipt for a one-shot efectivo sale', async () => {
      paymentService.registerPlanPayment.mockResolvedValue(savedPayment);
      receiptPrintService.printPaymentReceipt.mockResolvedValue({
        status: 'sent',
      });

      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/Payment/checkout')
        .set('Authorization', `Bearer ${tokenFor('admin', 40000001)}`)
        .send({
          userId: 3,
          planId: 1,
          months: 1,
          amount: 19995,
          payMethod: 'efectivo',
        })
        .expect(201);

      expect(receiptPrintService.printPaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 42,
          terminalId: 'terminal-1',
          cashier: 'admin@flg.test',
        }),
      );
      expect(response.body).toMatchObject({ printStatus: 'sent' });
    });
  });
});
