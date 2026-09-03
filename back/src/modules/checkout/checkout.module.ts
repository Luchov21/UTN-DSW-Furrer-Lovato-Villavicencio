import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PlanModule } from '../plan/plan.module';

@Module({
  imports: [PlanModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
