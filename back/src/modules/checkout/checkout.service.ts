import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { buildSummary, type CheckoutSummary } from './checkout.rules';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly planService: PlanService,
    private readonly planDurationService: PlanDurationService,
  ) {}

  /** The priced summary shown on the checkout page, before anything is charged. */
  async getSummary(planId: number, months: number): Promise<CheckoutSummary> {
    const plan = await this.planService.findPlan(planId);
    if (!plan || plan.deleted) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    const durations = await this.planDurationService.findByPlan(planId);
    return buildSummary(plan, months, durations);
  }
}
