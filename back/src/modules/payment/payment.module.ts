import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entity/payment.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { SubscriptionModule } from '../subscription/subscription.module';
import { UserModule } from '../user/user.module';
import { PlanModule } from '../plan/plan.module';
import { ReceiptModule } from '../receipt/receipt.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    SubscriptionModule,
    UserModule,
    PlanModule,
    ReceiptModule,
    MercadoPagoModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
