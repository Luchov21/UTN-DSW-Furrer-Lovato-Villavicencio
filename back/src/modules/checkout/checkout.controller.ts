import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SKIP_ALL_THROTTLERS } from '../../auth/auth.throttle';
import { Auth } from '../../auth/decorators/auth.decorator';
import { ActiveUser } from '../../common/decorators/active-user.decorator';
import type { UserActiveInterface } from '../../common/interfaces/user-active.interface';
import { Role } from '../../common/enum/role.enum';
import { CheckoutService } from './checkout.service';
import { CheckoutSummaryQueryDto } from './dto/checkout-summary-query-dto';
import { CheckoutDto } from './dto/checkout-dto';
import { CheckoutPreferenceDto } from './dto/checkout-preference-dto';
import { CheckoutArmDto } from './dto/checkout-arm-dto';
import { CheckoutStatusQueryDto } from './dto/checkout-status-query-dto';
import { PlanChangeQueryDto } from './dto/plan-change-query-dto';

@Controller('api/v1/checkout')
@ApiTags('Checkout')
// Not rate limited — see auth.throttle.ts.
@SkipThrottle(SKIP_ALL_THROTTLERS)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  // Public on purpose: a guest reads this summary on /checkout before they
  // have an account, so requiring a JWT would break the flow that needs it
  // most. It returns plan pricing and nothing else — no member data — and
  // GET /api/v1/plan is already public for the same reason.
  @Get('summary')
  getSummary(@Query() query: CheckoutSummaryQueryDto) {
    return this.checkoutService.getSummary(query.planId, query.months);
  }

  // Authenticated, unlike GET /summary: a prorated price depends on the
  // member's own live subscription and cannot be computed for a guest. That is
  // why this is a separate route rather than a flag on the public one.
  @Get('plan-change')
  @Auth(Role.USER)
  getPlanChangeQuote(
    @ActiveUser() user: UserActiveInterface,
    @Query() query: PlanChangeQueryDto,
  ) {
    return this.checkoutService.getPlanChangeQuote(user.sub, query.planId);
  }

  // Self-service: charges the authenticated member. userId and email come
  // from the JWT, never from the body — see CheckoutDto.
  @Post()
  @Auth(Role.USER)
  pay(@ActiveUser() user: UserActiveInterface, @Body() dto: CheckoutDto) {
    return this.checkoutService.pay(user.sub, user.email, dto);
  }

  // Creates the Mercado Pago preference the Payment Brick's wallet option
  // needs at mount time. Writes no charge order — see CheckoutService.
  @Post('preference')
  @Auth(Role.USER)
  createPreference(
    @ActiveUser() user: UserActiveInterface,
    @Body() dto: CheckoutPreferenceDto,
  ) {
    return this.checkoutService.createPreference(user.sub, user.email, dto);
  }

  // Arms the charge order a wallet payment settles against. Called from the
  // Brick's onSubmit; a non-2xx here cancels the redirect on purpose.
  @Post('arm')
  @Auth(Role.USER)
  @HttpCode(204)
  arm(@ActiveUser() user: UserActiveInterface, @Body() dto: CheckoutArmDto) {
    return this.checkoutService.armOrder(user.sub, dto);
  }

  // Polled by /checkout/return while the webhook settles a wallet payment.
  @Get('status')
  @Auth(Role.USER)
  getStatus(
    @ActiveUser() user: UserActiveInterface,
    @Query() query: CheckoutStatusQueryDto,
  ) {
    return this.checkoutService.getStatus(user.sub, query.externalReference);
  }
}
