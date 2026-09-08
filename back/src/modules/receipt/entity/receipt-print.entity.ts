import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// One row per print attempt for a document printed on the Point terminal —
// a payment's informational ticket, or a member's credentials slip. No
// relation to the described row — same bare-column pattern as
// ChargeOrder.paymentId — since nothing here ever needs to join back through
// TypeORM, only to look up by documentType + documentId + contentHash before
// retrying.
@Entity('receipt_prints')
export class ReceiptPrint {
  @PrimaryGeneratedColumn()
  id!: number;

  // Which kind of document this print was: the informational payment
  // ticket, or a member's credentials slip. Kept as a plain string, same
  // convention as ChargeOrder.status.
  @Column({ type: 'varchar', length: 20, nullable: false })
  documentType!: string;

  // The id of the row that document describes — a Payment for 'payment', a
  // Users for 'credentials'. No relation, same bare-column pattern as
  // before: nothing joins back through TypeORM, it is only looked up
  // alongside documentType and contentHash before retrying.
  @Column({ type: Number, nullable: false })
  documentId!: number;

  @Column({ type: 'varchar', length: 64, nullable: false })
  terminalId!: string;

  @Column({ type: 'varchar', length: 64, nullable: false })
  externalReference!: string;

  @Column({ type: 'varchar', length: 64, nullable: false })
  idempotencyKey!: string;

  // Mercado Pago's own id for the created action, when the create call
  // reached MP at all (null on a render failure, which never gets this
  // far). Needed to look up or cancel a stuck action later — see
  // MercadoPagoTerminalPrinterClient.getAction/cancelAction. A terminal
  // holds only one queued action at a time, so without this id a stuck one
  // can't be found again.
  @Column({ type: 'varchar', length: 64, nullable: true })
  actionId!: string | null;

  // Mercado Pago's status for that action at the time of this attempt
  // ('created', 'on_terminal', ...) — a snapshot, not live; re-query via
  // getAction(actionId) for the current value.
  @Column({ type: 'varchar', length: 20, nullable: true })
  actionStatus!: string | null;

  // sha256 of the rendered JPEG bytes — lets a retry of the same document
  // recognize "this exact ticket already printed" and skip re-sending it to
  // the terminal, without needing to keep the image itself around.
  @Column({ type: 'varchar', length: 64, nullable: false })
  contentHash!: string;

  // 'sent' | 'error' — kept as a plain string, same convention as
  // ChargeOrder.status.
  @Column({ type: 'varchar', length: 10, nullable: false })
  status!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'datetime', nullable: false })
  createdAt!: Date;
}
