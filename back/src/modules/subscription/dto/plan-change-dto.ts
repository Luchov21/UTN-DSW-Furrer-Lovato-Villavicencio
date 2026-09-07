import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

// userId never travels in this body: the controller resolves it from the JWT
// (@ActiveUser), the same rule every self-service DTO in this module follows.
export class PlanChangeDto {
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  planId!: number;
}
