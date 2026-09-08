import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  /**
   * Format a Date or YYYY-MM-DD string as DD/MM/YYYY.
   * If input is a string already in YYYY-MM-DD format, just reformat directly
   * to avoid timezone shifts. If it's a Date, use local getters.
   */
  private formatDateDDMMYYYY(date: Date | string): string {
    if (typeof date === 'string') {
      // Assume YYYY-MM-DD format
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year}`;
    }
    // Date object: use local date parts
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async sendContactNotification(data: {
    name: string;
    surname: string;
    email: string;
    message: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `Formulario FLG <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        replyTo: data.email,
        subject: `Nueva consulta de contacto: ${data.name} ${data.surname}`,
        text: `Nombre: ${data.name} ${data.surname}\nEmail: ${data.email}\n\nMensaje:\n ${data.message}`,
        html: `
                <h3>Nueva consulta desde el formulario de contacto de FLG</h3>
                <p><strong>Nombre:</strong> ${data.name} ${data.surname}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Mensaje:</strong></p>
                <p>${data.message.replace(/\n/g, '<br>')}</p>
                `,
      });
    } catch (error) {
      this.logger.error(`Error al enviar el email de contacto`, error);
    }
  }

  async sendPaymentReceipt(data: {
    to: string;
    name: string;
    planName: string;
    amount: number;
    // null marks a prorated plan-change payment — it buys no term, so there
    // is no month count to show. The caller (CheckoutService.settle) passes
    // null exactly when charge.termMonths is 0, never a bare 0/undefined
    // here, so this template never has to guess.
    termMonths: number | null;
    method: string;
    newEndDate: Date | string;
  }): Promise<void> {
    try {
      const formattedAmount = `$${data.amount.toLocaleString('es-AR')}`;
      const formattedEndDate = this.formatDateDDMMYYYY(data.newEndDate);
      const durationLine =
        data.termMonths === null
          ? 'Ajuste de plan'
          : `${data.termMonths} ${data.termMonths === 1 ? 'mes' : 'meses'}`;
      const text = `Hola ${data.name},\n\nTe enviamos tu recibo de pago:\n\nMonto: ${formattedAmount}\nPlan: ${data.planName}\nDuración: ${durationLine}\nMétodo de pago: ${data.method}\nNueva fecha de vencimiento: ${formattedEndDate}\n\nGracias por tu confianza en FLG.`;

      const html = `
                <h3>Recibo de pago — FLG</h3>
                <p>Hola <strong>${data.name}</strong>,</p>
                <p>Te enviamos tu recibo de pago:</p>
                <ul>
                  <li><strong>Monto:</strong> ${formattedAmount}</li>
                  <li><strong>Plan:</strong> ${data.planName}</li>
                  <li><strong>Duración:</strong> ${durationLine}</li>
                  <li><strong>Método de pago:</strong> ${data.method}</li>
                  <li><strong>Nueva fecha de vencimiento:</strong> ${formattedEndDate}</li>
                </ul>
                <p>Gracias por tu confianza en FLG.</p>
                `;

      await this.transporter.sendMail({
        from: `FLG <${process.env.GMAIL_USER}>`,
        to: data.to,
        subject: `Recibo de pago — FLG`,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Error al enviar el recibo de pago`, error);
    }
  }

  async sendRenewalFailure(data: {
    to: string;
    name: string;
    planName: string;
    endDate: Date | string;
    isFinalAttempt: boolean;
  }): Promise<void> {
    try {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
      const formattedEndDate = this.formatDateDDMMYYYY(data.endDate);

      if (!data.isFinalAttempt) {
        // Retry attempt
        const text = `Hola ${data.name},\n\nNo pudimos procesar el pago de tu membresía. Tu tarjeta fue rechazada.\n\nNo te preocupes, reintentaremos procesar tu pago en los próximos días. Si lo prefieres, puedes actualizar tu método de pago aquí: ${frontendUrl}/mi-cuenta/pagos\n\nGracias por tu confianza en FLG.`;

        const html = `
                  <h3>No pudimos procesar el pago de tu membresía</h3>
                  <p>Hola <strong>${data.name}</strong>,</p>
                  <p>No pudimos procesar el pago de tu membresía. Tu tarjeta fue rechazada.</p>
                  <p>No te preocupes, reintentaremos procesar tu pago en los próximos días. Si lo prefieres, puedes <a href="${frontendUrl}/mi-cuenta/pagos">actualizar tu método de pago aquí</a>.</p>
                  <p>Gracias por tu confianza en FLG.</p>
                  `;

        await this.transporter.sendMail({
          from: `FLG <${process.env.GMAIL_USER}>`,
          to: data.to,
          subject: `No pudimos procesar el pago de tu membresía`,
          text,
          html,
        });
      } else {
        // Final attempt
        const text = `Hola ${data.name},\n\nTu membresía vence mañana.\n\nEsta fue nuestra última semana intentando procesar el pago automático. Si no actualizas tu método de pago o realizas un pago en persona antes del ${formattedEndDate}, tu acceso se cancelará.\n\nActualiza tu método de pago aquí: ${frontendUrl}/mi-cuenta/pagos\n\nGracias por tu confianza en FLG.`;

        const html = `
                  <h3>Tu membresía vence mañana</h3>
                  <p>Hola <strong>${data.name}</strong>,</p>
                  <p>Tu membresía vence mañana.</p>
                  <p>Esta fue nuestra última semana intentando procesar el pago automático. Si no actualizas tu método de pago o realizas un pago en persona antes del <strong>${formattedEndDate}</strong>, tu acceso se cancelará.</p>
                  <p><a href="${frontendUrl}/mi-cuenta/pagos">Actualiza tu método de pago aquí</a>.</p>
                  <p>Gracias por tu confianza en FLG.</p>
                  `;

        await this.transporter.sendMail({
          from: `FLG <${process.env.GMAIL_USER}>`,
          to: data.to,
          subject: `Tu membresía vence mañana`,
          text,
          html,
        });
      }
    } catch (error) {
      this.logger.error(`Error al enviar el aviso de renovación fallida`, error);
    }
  }

  async sendRefundConfirmation(data: {
    to: string;
    name: string;
    refundedAmount: number;
    monthsCharged: number;
    cancelledOn: Date | string;
  }): Promise<void> {
    try {
      const formattedAmount = `$${data.refundedAmount.toLocaleString('es-AR')}`;
      const formattedCancelDate = this.formatDateDDMMYYYY(data.cancelledOn);
      const text = `Hola ${data.name},\n\nTe confirmamos que tu reembolso ha sido procesado:\n\nMonto reembolsado: ${formattedAmount}\nMeses cobrados a la tarifa regular: ${data.monthsCharged}\nFecha de cancelación: ${formattedCancelDate}\n\nGracias por haber sido parte de FLG.`;

      const html = `
                <h3>Reembolso procesado — FLG</h3>
                <p>Hola <strong>${data.name}</strong>,</p>
                <p>Te confirmamos que tu reembolso ha sido procesado:</p>
                <ul>
                  <li><strong>Monto reembolsado:</strong> ${formattedAmount}</li>
                  <li><strong>Meses cobrados a la tarifa regular:</strong> ${data.monthsCharged}</li>
                  <li><strong>Fecha de cancelación:</strong> ${formattedCancelDate}</li>
                </ul>
                <p>Gracias por haber sido parte de FLG.</p>
                `;

      await this.transporter.sendMail({
        from: `FLG <${process.env.GMAIL_USER}>`,
        to: data.to,
        subject: `Reembolso procesado — FLG`,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(`Error al enviar la confirmación de reembolso`, error);
    }
  }
}
