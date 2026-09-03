import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Subscription } from '../../subscription/entity/subscription.entity';
import { PlanDuration } from '../../plan/entity/plan-duration.entity';
import { decimalTransformer } from '../../../common/decimal.transformer';

// A front-desk collection in progress: a card-terminal ("point") or QR charge
// armed against one physical collection point. The amount is a snapshot of
// the resolved term's price at creation time, so a price change mid-charge
// can never alter what the member is asked to pay — see
// ChargeOrderService.createCharge. externalReference/expiresAt follow the
// rules in chargeOrder.rules.ts, shared with the Mercado Pago order this row
// backs once Task 16 wires the actual MP calls.
@Entity('charge_orders')
export class ChargeOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  // Null until the charge is confirmed: the subscription this order produces
  // does not exist while the order is still pending, and never exists at all
  // if the charge is abandoned, expires or is declined.
  @Column({ type: Number, nullable: true })
  subscriptionId!: number | null;

  @ManyToOne(() => Subscription, { eager: true, nullable: true })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: Subscription | null;

  // What is being bought. Recorded on the order because the webhook needs it
  // to build the subscription once the money lands.
  @Column({ type: Number, nullable: false })
  userId!: number;

  @Column({ type: Number, nullable: false })
  planId!: number;

  @Column({ type: Number, nullable: false })
  termMonths!: number;

  // Null means the plan's own 1-month price — same convention as
  // Subscription.planDurationId.
  @Column({ type: Number, nullable: true })
  planDurationId!: number | null;

  @ManyToOne(() => PlanDuration, { eager: true, nullable: true })
  @JoinColumn({ name: 'planDurationId' })
  planDuration!: PlanDuration | null;

  // 'point' (card terminal), 'qr' (shared printed code) or 'online' (member
  // checkout, no physical collection point) — see ChargeOrderMethod.
  @Column({ type: 'varchar', length: 10, nullable: false })
  method!: 'point' | 'qr' | 'online';

  @Column({ type: 'varchar', length: 64, nullable: false, unique: true })
  externalReference!: string;

  // The Mercado Pago order id. Null until Task 16's controller actually
  // creates the order with MP and fills this in.
  @Column({ type: 'varchar', length: 64, nullable: true })
  mpOrderId!: string | null;

  // The QR payload MP returns for a 'qr' order (MpOrderResult.qrData) — what
  // the front-desk panel renders as a scannable code. 'text', not 'varchar',
  // since it's a data string with no fixed bound, same convention as
  // Contact.message. Always null for 'point' orders, and null for 'qr'
  // orders too until the controller's createOrder call succeeds. Persisted
  // (not just returned once from the POST response) so a panel reload or a
  // re-poll of GET /:id can still render the code for the rest of the
  // order's 5-minute window — see ChargeOrderController.getCharge.
  @Column({ type: 'text', nullable: true })
  qrPayload!: string | null;

  // The terminal id for 'point', the external_pos_id for 'qr'. The busy-point
  // check in createCharge queries on this column, not on subscriptionId —
  // that's what makes a shared printed QR safe: two different members must
  // not be able to have simultaneous live orders on the same physical point.
  //
  // Null for an 'online' order: the member pays from their own browser, so
  // there is no caja to hold. The busy-point check in createCharge queries on
  // this column and is skipped entirely for that method.
  @Column({ type: 'varchar', length: 64, nullable: true })
  collectionPointId!: string | null;

  // Snapshotted from the resolved term's price at creation time. Never
  // recompute this from the term later — a price change after the order was
  // armed must not change what the member already agreed to pay.
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    transformer: decimalTransformer,
  })
  amount!: number;

  // See ChargeOrderStatus for the possible values.
  @Column({
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'pendiente',
  })
  status!: string;

  @Column({ type: 'datetime', nullable: false })
  expiresAt!: Date;

  // Set by closeAsPaid once the webhook (Task 16+) confirms the payment. No
  // relation — same bare-column pattern as Payment.registeredById elsewhere
  // in this codebase, since it's only ever set well after creation.
  @Column({ type: Number, nullable: true })
  paymentId!: number | null;

  // The admin who started the charge at the counter, or null when the member
  // started it themselves from the checkout — the same meaning
  // Payment.registeredById: null already carries for a cron renewal.
  @Column({ type: Number, nullable: true })
  createdById!: number | null;

  @Column({ type: 'datetime', nullable: false })
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: false })
  updatedAt!: Date;
}
