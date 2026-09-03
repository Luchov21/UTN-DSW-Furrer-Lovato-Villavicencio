import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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

  // Self-service: charges the authenticated member. userId and email come
  // from the JWT, never from the body — see CheckoutDto.
  @Post()
  @Auth(Role.USER)
  pay(@ActiveUser() user: UserActiveInterface, @Body() dto: CheckoutDto) {
    return this.checkoutService.pay(user.sub, user.email, dto);
  }
}
