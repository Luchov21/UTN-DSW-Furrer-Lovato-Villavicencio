import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmConfig } from './config/typeorm.config';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserModule } from './modules/user/user.module';
import { PlanModule } from './modules/plan/plan.module';
import { TrainerModule } from './modules/trainer/trainer.module';
import { ClassModule } from './modules/class/class.module';
import { PaymentModule } from './modules/payment/payment.module';
import { TypeClassModule } from './modules/typeClass/typeClass.module';
import { classRegistrationModule } from './modules/classRegistration/classRegistration.module';
import { ClassSessionModule } from './modules/classSession/classSession.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { PauseModule } from './modules/subscription/pause.module';
import { RenewalModule } from './modules/renewal/renewal.module';
import { RefundModule } from './modules/refund/refund.module';
import { MercadoPagoWebhookModule } from './modules/mercadopago/mercadopago-webhook.module';
import { ContactModule } from './modules/contact/contact.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { AuthModule } from './auth/auth.module';
import { REGISTERED_THROTTLERS } from './auth/auth.throttle';
import { SecurityLogInterceptor } from './common/interceptors/security-log.interceptor';
import { SecurityLogFilter } from './common/filters/security-log.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(REGISTERED_THROTTLERS),
    // Drives the nightly subscription expiry sweep in subscriptionService.
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmConfig,
    }),
    UserModule,
    TypeClassModule,
    PlanModule,
    TrainerModule,
    ClassModule,
    ClassSessionModule,
    SubscriptionModule,
    PauseModule,
    PaymentModule,
    RenewalModule,
    RefundModule,
    MercadoPagoWebhookModule,
    classRegistrationModule,
    ContactModule,
    AnalyticsModule,
    CheckoutModule,
    AuthModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: SecurityLogInterceptor },
    { provide: APP_FILTER, useClass: SecurityLogFilter },
  ],
})
export class AppModule {}
