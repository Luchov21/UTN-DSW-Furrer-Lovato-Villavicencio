import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

// No userId: it comes from the JWT, the same rule every self-service DTO here
// follows. No months either — a plan change never buys a term.
export class PlanChangeQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  planId!: number;
}
