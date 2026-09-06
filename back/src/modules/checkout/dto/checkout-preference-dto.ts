import { IsIn, IsInt, IsOptional, IsPositive, ValidateIf } from 'class-validator';

// No amount, by the same rule as CheckoutDto: the backend resolves the price
// from the plan, because a client-supplied amount is a free-membership hole.
export class CheckoutPreferenceDto {
  @IsInt()
  @IsPositive()
  planId!: number;

  // 'plan-change' prices the prorated difference against the member's live
  // subscription instead of selling a term. Optional so every existing client
  // keeps working unchanged.
  @IsOptional()
  @IsIn(['term', 'plan-change'])
  mode?: 'term' | 'plan-change';

  @ValidateIf((dto: CheckoutPreferenceDto) => dto.mode !== 'plan-change')
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;
}
