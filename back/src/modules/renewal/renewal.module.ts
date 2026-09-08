import { Module } from '@nestjs/common';
import { RenewalService } from './renewal.service';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SavedCardModule } from '../savedCard/savedCard.module';
import { PaymentModule } from '../payment/payment.module';
import { PlanModule } from '../plan/plan.module';
import { MailModule } from '../../common/mail/mail.module';

// Pulls together every module the nightly renewal cron needs: MercadoPagoModule
// for config/client, SubscriptionModule for findDueForRenewal, SavedCardModule
// for the member's chargeable card, PaymentModule to record the outcome,
// PlanModule to look up the scheduled plan a downgrade would open the next
// term on, and MailModule for the receipt/decline notifications. No
// controller — this module exists purely to host RenewalService's @Cron job.
@Module({
  imports: [
    MercadoPagoModule,
    SubscriptionModule,
    SavedCardModule,
    PaymentModule,
    PlanModule,
    MailModule,
  ],
  providers: [RenewalService],
  exports: [RenewalService],
})
export class RenewalModule {}
