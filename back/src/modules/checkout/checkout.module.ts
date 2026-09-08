import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PlanModule } from '../plan/plan.module';
import { ChargeOrderModule } from '../chargeOrder/chargeOrder.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { PaymentModule } from '../payment/payment.module';
import { SavedCardModule } from '../savedCard/savedCard.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { MailModule } from '../../common/mail/mail.module';

// SubscriptionModule already imports SavedCardModule (for the auto-renew
// toggle's card-existence check); importing both here is fine, since neither
// of them — nor ChargeOrderModule, MercadoPagoModule, PaymentModule or
// MailModule — imports CheckoutModule back.
@Module({
  imports: [
    PlanModule,
    ChargeOrderModule,
    MercadoPagoModule,
    PaymentModule,
    SavedCardModule,
    SubscriptionModule,
    MailModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
