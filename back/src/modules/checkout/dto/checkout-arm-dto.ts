import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Matches,
} from 'class-validator';

// Still no amount: armOrder re-prices from the plan. The reference is the one
// POST /checkout/preference minted and baked into the Mercado Pago
// preference — the row must carry the same one or the webhook resolves
// nothing.
export class CheckoutArmDto {
  @IsInt()
  @IsPositive()
  planId!: number;

  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;

  // Mirrors buildExternalReference's output. The pattern is a cheap guard
  // against a caller probing the table with arbitrary strings.
  @IsString()
  @IsNotEmpty()
  @Matches(/^flg-user-\d+-[a-f0-9]{8}$/)
  externalReference!: string;
}
