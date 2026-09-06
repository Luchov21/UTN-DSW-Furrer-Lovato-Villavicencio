import { IsOptional, IsString, MinLength } from 'class-validator';

// The password travels back from the browser because it is not stored in the
// clear anywhere — the column holds a bcrypt hash. This endpoint prints the
// string it is given; it is admin-only for exactly that reason.
export class CredentialsSlipDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  planName?: string;

  @IsString()
  @IsOptional()
  termLabel?: string;
}
