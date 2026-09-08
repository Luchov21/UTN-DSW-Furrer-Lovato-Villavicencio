import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// Creating a member at the front desk. Unlike RegisterDto, email and password
// are optional: a member who only ever comes to the gym has neither, and
// user.rules.ts fills the NOT NULL email column with a placeholder. `role` is
// deliberately absent — a new member is always a USER, and promoting one is a
// separate, deliberate action in the Users panel.
export class AdminCreateUserDto {
  @IsNumber()
  @IsPositive()
  // See RegisterDto: a DNI is 7 or 8 digits, and anything past that overflows
  // the `int` column it's stored in.
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
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'La contraseña debe tener al menos una letra y un número.',
  })
  @IsOptional()
  password?: string;
}
