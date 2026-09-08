import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  // A DNI is 7 or 8 digits. Below is a typo, and anything at or past 9 digits
  // overflows the `int` column users.dni is stored in, which MySQL rejects
  // with a driver error instead of a validation one.
  @Min(1000000, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  @Max(99999999, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  dni!: number;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  surname!: string;

  @IsString()
  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe tener al menos una letra y un número.',
  })
  password!: string;
}
