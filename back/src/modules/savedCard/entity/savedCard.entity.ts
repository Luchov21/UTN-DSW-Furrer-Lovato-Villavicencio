import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// The member's tokenized card, one row per Mercado Pago saved card. userId is
// a bare column with no relation — same "bare FK-style column" pattern as
// Payment.registeredById — since a saved card never needs to eager-load the
// full user row just to be fetched or charged.
@Entity('saved_cards')
export class SavedCard {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: Number, nullable: false })
  userId!: number;

  // The Mercado Pago customer this card is attached to. Needed alongside
  // mpCardId for every later operation (charging, deleting) — Mercado Pago's
  // API is scoped by customer, not by card id alone.
  @Column({ type: String, nullable: false, length: 64 })
  mpCustomerId!: string;

  // The Mercado Pago card id. Identifies a real payment instrument — never
  // returned to the browser (see SavedCardController).
  @Column({ type: String, nullable: false, length: 64 })
  mpCardId!: string;

  @Column({ type: String, nullable: false, length: 4 })
  lastFourDigits!: string;

  @Column({ type: String, nullable: false, length: 32 })
  paymentMethodId!: string;

  // credit_card / debit_card — required by the Orders API for every card
  // charge. Nullable because cards saved before this column existed have no
  // value; isChargeable treats a null here as not-chargeable.
  @Column({ type: String, nullable: true, length: 32 })
  paymentTypeId?: string | null;

  @Column({ type: Number, nullable: false })
  expirationMonth!: number;

  @Column({ type: Number, nullable: false })
  expirationYear!: number;

  // Whether this is the member's current card. saveForUser deactivates any
  // previous active card in the same transaction as inserting a new one, so
  // a member can never hold two chargeable cards or none.
  @Column({ type: Boolean, nullable: false, default: true })
  active!: boolean;

  @Column({ type: Boolean, nullable: false, default: false })
  deleted!: boolean;
}
