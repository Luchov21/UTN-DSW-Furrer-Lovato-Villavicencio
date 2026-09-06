import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Subscription } from '../../subscription/entity/subscription.entity';
import { decimalTransformer } from '../../../common/decimal.transformer';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: Number, nullable: false })
  subscriptionId!: number;

  @ManyToOne(() => Subscription, { eager: true, nullable: false })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: Subscription;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'datetime', nullable: false })
  date!: Date;

  @Column({ type: String, nullable: false, length: 50 })
  payMethod!: string;

  @Column({ type: String, nullable: false, default: 'completado' })
  state!: string;

  // Id of the admin who recorded the in-person payment. Null for payments
  // that will come from Mercado Pago later on, since nobody records those.
  @Column({ type: Number, nullable: true })
  registeredById?: number | null;

  // The Mercado Pago payment id. UNIQUE, and that constraint is the real
  // idempotency guarantee: MP retries a notification up to eight times over four
  // days, and two deliveries of the same payment must not become two rows — nor
  // extend a membership twice. Null for cash, which has no MP counterpart; MySQL
  // allows many NULLs under a UNIQUE index, so the front desk is unaffected.
  @Column({ type: String, nullable: true, unique: true, length: 64 })
  mpPaymentId?: string | null;

  // The Orders API order id this payment belongs to, when it came from one
  // (online checkout or the renewal cron) — not set for a classic Payments
  // API payment or a cash/manual one. RefundService reads this to decide
  // whether a refund needs POST /v1/orders/{id}/refund instead of the
  // classic endpoint.
  @Column({ type: String, nullable: true, length: 64 })
  mpOrderId?: string | null;

  // How many months this payment bought, and what a single month cost at the
  // time. Both are snapshots: a refund computed years later must use the prices
  // that were actually agreed, not whatever the plan costs by then.
  @Column({ type: Number, nullable: false, default: 1 })
  termMonths!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    transformer: decimalTransformer,
  })
  monthlyPriceAtPurchase!: number;

  // Set when an admin refunds this payment. The amount is stored rather than
  // inferred, because a pro-rata refund is deliberately not the full amount.
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  refundedAmount?: number | null;

  @Column({ type: 'datetime', nullable: true })
  refundedAt?: Date | null;

  @Column({ type: Number, nullable: true })
  refundedById?: number | null;

  @Column({ type: Boolean, nullable: false, default: false })
  deleted!: boolean;
}
