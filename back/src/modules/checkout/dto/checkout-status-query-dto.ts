import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckoutStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^flg-user-\d+-[a-f0-9]{8}$/)
  externalReference!: string;
}
