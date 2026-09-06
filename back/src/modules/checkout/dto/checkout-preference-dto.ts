import { IsIn, IsInt, IsPositive } from 'class-validator';

// No amount, by the same rule as CheckoutDto: the backend resolves the price
// from the plan, because a client-supplied amount is a free-membership hole.
export class CheckoutPreferenceDto {
  @IsInt()
  @IsPositive()
  planId!: number;

  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;
}
