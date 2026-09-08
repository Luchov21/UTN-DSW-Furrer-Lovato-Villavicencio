import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
} from 'class-validator';
import { ChargeOrderMethod } from '../enum/chargeOrder-method.enum';

// Arms a front-desk charge at the counter. adminId is never accepted here —
// it comes from the JWT via @ActiveUser(), same rule as ManualPaymentDto's
// note on not accepting a user id directly.
export class CreateChargeOrderDto {
  @IsInt()
  @IsPositive()
  userId!: number;

  @IsInt()
  @IsPositive()
  planId!: number;

  // MONTHS, never a day count — the backend resolves numDays itself through
  // resolveTerm, so a forged value cannot buy free access.
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months!: number;

  // Admin-editable on purpose: the front desk gives discounts.
  @IsNumber()
  @IsPositive()
  amount!: number;

  // Deliberately narrower than ChargeOrderMethod: 'online' is the member
  // paying for themselves through CheckoutService, which arms its own order
  // with no collection point. Accepting it here would hand an online order
  // the QR caja's id (the controller's method branch treats anything but
  // 'point' as QR) while ChargeOrderService.createCharge skips the busy-point
  // lock for 'online' — a second live order on a shared printed QR with
  // nothing guarding it.
  @IsIn([ChargeOrderMethod.POINT, ChargeOrderMethod.QR])
  method!: ChargeOrderMethod.POINT | ChargeOrderMethod.QR;

  // The terminal id for 'point', the external_pos_id for 'qr' — see the
  // entity's own comment on collectionPointId.
  @IsString()
  @IsNotEmpty()
  collectionPointId!: string;
}
