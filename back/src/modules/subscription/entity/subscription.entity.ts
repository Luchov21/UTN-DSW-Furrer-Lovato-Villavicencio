import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Users } from '../../user/entity/users.entity';
import { Plan } from '../../plan/entity/plan.entity';
import { PlanDuration } from '../../plan/entity/plan-duration.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: Number, nullable: false })
  userId!: number;

  @ManyToOne(() => Users, { eager: true, nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: Users;

  @Column({ type: Number, nullable: false })
  planId!: number;

  @ManyToOne(() => Plan, { eager: true, nullable: false })
  @JoinColumn({ name: 'planId' })
  plan!: Plan;

  @Column({ type: 'date', nullable: false })
  startDate!: Date;

  @Column({ type: 'date', nullable: false })
  endDate!: Date;

  @Column({ type: String, nullable: false, default: 'activa' })
  state!: string;

  @Column({ type: Boolean, nullable: false, default: false })
  deleted!: boolean;

  // Whether this membership charges itself when it is about to run out. Off by
  // default: a member opts in when they save a card, and switching it off must
  // never be harder than switching it on.
  @Column({ type: Boolean, nullable: false, default: false })
  autoRenew!: boolean;

  // When the current freeze began. Null unless state is PAUSED. The days owed
  // back are derived from this at unpause rather than accumulated, so a crash
  // between pause and unpause cannot lose or double-count them.
  @Column({ type: 'datetime', nullable: true })
  pausedAt!: Date | null;

  // The admin who froze the membership. No FK relation — same bare-column
  // pattern as Payment.registeredById elsewhere in this codebase.
  @Column({ type: Number, nullable: true })
  pausedById!: number | null;

  // Which PlanDuration this subscription was sold at. Null means the plan's own
  // one-month price, which is every subscription written before this column
  // existed. Needed to compute MRR — a 12-month price divided by 12 — and to
  // label a subscription as "Premium — 6 meses" in the admin panel.
  //
  // Deliberately NOT eager, unlike `user` and `plan` above: a third eager
  // relation makes every joined payment row heavier still.
  @Column({ type: Number, nullable: true })
  planDurationId?: number | null;

  @ManyToOne(() => PlanDuration, { nullable: true })
  @JoinColumn({ name: 'planDurationId' })
  planDuration?: PlanDuration | null;

  // The plan/duration's LIST price as resolved at the moment of sale — not
  // Payment.amount, which is admin-editable and can differ (a discount).
  // Null means this subscription predates this column. This is what MRR
  // must read, not planDuration.price: a PlanDuration's price can be
  // changed later (retire the old row, add a new one at the same month
  // count — the only way the admin UI supports repricing a term), and a
  // live join would then silently rewrite what every already-sold
  // subscription is recorded as having cost.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  soldPrice?: number | null;

  // The plan the member's NEXT term opens on. Set by a scheduled downgrade,
  // which costs nothing and changes nothing today; read and cleared by
  // subscriptionService.renew when the next term actually begins. Null is the
  // normal state — a downgrade is the only thing that ever sets it.
  //
  // Deliberately a bare column with no ManyToOne relation, like
  // Payment.registeredById elsewhere in this codebase: the renewal path looks
  // the plan up explicitly, and a fourth eager relation would make every
  // joined subscription row heavier for a field almost every row leaves null.
  @Column({ type: Number, nullable: true })
  scheduledPlanId?: number | null;

  // The subscription this row replaced through a PAID plan change. It answers
  // two questions at once, which is why it is one column and not two flags:
  // non-null means "a change was already applied in this term" (one change per
  // term is the rule), and following it once gives the ORIGINAL term's
  // startDate, which is what the 30-day lock must measure from — this row's
  // own startDate is today, and measuring from it would reset the lock.
  //
  // Because a second change in the same term is refused, this chain is NEVER
  // longer than one hop. findChangeContext follows it exactly once and does
  // not loop; if the one-change rule is ever relaxed, that is the code that
  // has to change.
  @Column({ type: Number, nullable: true })
  changedFromSubscriptionId?: number | null;
}
