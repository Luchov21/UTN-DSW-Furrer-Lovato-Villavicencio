import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';

// userId and email never travel in this body: the controller resolves both
// from the JWT (@ActiveUser), the same rule ChangePlanDto and SaveCardDto
// follow. No amount travels either — the backend resolves the price from the
// plan, because a client-supplied amount is a free-membership hole.
export class CheckoutDto {
  @IsInt()
  @IsPositive()
  planId!: number;

  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;

  // Required unless the member is paying with the card already on file. The
  // browser never names WHICH saved card — it cannot see mpCardId, and a
  // member has at most one active card.
  @ValidateIf((dto: CheckoutDto) => !dto.useSavedCard)
  @IsString()
  @IsNotEmpty()
  cardToken?: string;

  @ValidateIf((dto: CheckoutDto) => !dto.useSavedCard)
  @IsString()
  @IsNotEmpty()
  paymentMethodId?: string;

  @ValidateIf((dto: CheckoutDto) => !dto.useSavedCard)
  @IsString()
  @IsNotEmpty()
  paymentTypeId?: string;

  @IsBoolean()
  @IsOptional()
  useSavedCard?: boolean;

  // Only meaningful alongside cardToken; a saved card is already saved.
  @IsBoolean()
  @IsOptional()
  saveCard?: boolean;

  // The browser disables the button; this refuses the sale. Both are needed:
  // one is a courtesy, the other is the rule.
  @IsBoolean()
  @Equals(true)
  acceptedTerms!: boolean;
}
