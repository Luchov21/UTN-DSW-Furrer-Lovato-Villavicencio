import { Type } from 'class-transformer';
import { IsIn, IsInt, IsPositive } from 'class-validator';

// A query string arrives as text; @Type coerces before the numeric validators
// run, the same way PaymentQueryDto handles its own numeric filters.
export class CheckoutSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  planId!: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;
}
