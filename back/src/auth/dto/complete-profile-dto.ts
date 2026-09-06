import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// The two fields Google never gives us.
//
// `dni` is optional here and required in the service instead, because whether
// it is required depends on the caller: an account that already has one sends
// the field read-only, and a walk-in member completing only a missing phone
// sends none at all.
export class CompleteProfileDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  // See RegisterDto: a DNI is 7 or 8 digits, and anything past that overflows
  // the `int` column it's stored in.
  @Min(1000000, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  @Max(99999999, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  dni?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(6, { message: 'El teléfono no parece válido.' })
  phone!: string;
}
