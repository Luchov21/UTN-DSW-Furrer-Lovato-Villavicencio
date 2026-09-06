import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enum/role.enum';

// Admin-side edit of a user (Users panel). It deliberately has no `password`:
// UsersDto, which the now-deleted PUT /user used to take, required one on
// every update, forcing the caller to send something that ended up stored
// unhashed. This DTO closed that hole and sticks to the fields an admin
// actually needs.
export class AdminUpdateUserDto {
  // Correcting a typo in a member's document number is an admin action. The
  // member's own UpdateProfileDto deliberately has no such field.
  @IsNumber()
  @IsPositive()
  @IsOptional()
  // See RegisterDto: a DNI is 7 or 8 digits, and anything past that overflows
  // the `int` column it's stored in.
  @Min(1000000, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  @Max(99999999, { message: 'El DNI tiene que tener 7 u 8 dígitos.' })
  dni?: number;

  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  surname?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}
