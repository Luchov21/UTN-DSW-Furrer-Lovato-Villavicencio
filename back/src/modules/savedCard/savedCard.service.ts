import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedCard } from './entity/savedCard.entity';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
} from '../mercadopago/mercadopago.client';
import { Subscription } from '../subscription/entity/subscription.entity';

/**
 * A complete card, ready to be written as a `SavedCard` row. Every field is
 * required: a half-populated row identifies a payment method the gym cannot
 * actually charge later.
 */
export interface PersistableCard {
  /** Mercado Pago's own card id, the value charged as `mpCardId`. */
  id: string;
  lastFourDigits: string;
  paymentMethodId: string;
  paymentTypeId: string | null;
  expirationMonth: number;
  expirationYear: number;
}

@Injectable()
export class SavedCardService {
  constructor(
    @InjectRepository(SavedCard)
    private savedCardRepository: Repository<SavedCard>,
    // Registered directly via TypeOrmModule.forFeature in savedCard.module.ts
    // rather than by importing SubscriptionModule and its subscriptionService:
    // SubscriptionModule already imports SavedCardModule (for the auto-renew
    // toggle's card check in subscription.controller.ts), so the reverse edge
    // here would be a circular module dependency. Turning autoRenew off is a
    // simple, unconditional field write — it doesn't need subscriptionService's
    // business logic (findActiveForUser's endDate check, etc.), only this.
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private readonly mercadoPagoClient: MercadoPagoClient,
  ) {}

  // Deactivating the previous active card and inserting the new one run in
  // the SAME transaction so a crash between the two can never leave the
  // member holding two chargeable cards or none. Shared by both entry points
  // below, which differ only in where the card data came from.
  private persistCard(
    userId: number,
    mpCustomerId: string,
    card: PersistableCard,
  ): Promise<SavedCard> {
    return this.savedCardRepository.manager.transaction(async (manager) => {
      await manager.update(
        SavedCard,
        { userId, active: true, deleted: false },
        { active: false },
      );

      const newCard = manager.create(SavedCard, {
        userId,
        mpCustomerId,
        mpCardId: card.id,
        lastFourDigits: card.lastFourDigits,
        paymentMethodId: card.paymentMethodId,
        paymentTypeId: card.paymentTypeId,
        expirationMonth: card.expirationMonth,
        expirationYear: card.expirationYear,
        active: true,
        deleted: false,
      });
      return manager.save(newCard);
    });
  }

  /**
   * Persists the card a just-approved payment was made with, using only that
   * payment's own response — no second Mercado Pago call.
   *
   * This is what the online checkout must use. Its charge already spent the
   * single-use card token, so `saveForUser`'s `Customer.createCard` would
   * fail there every single time; the approved payment already carries the
   * card id Mercado Pago attached to the customer the charge was scoped to.
   */
  async saveFromApprovedPayment(
    userId: number,
    mpCustomerId: string,
    card: PersistableCard,
  ): Promise<SavedCard> {
    return this.persistCard(userId, mpCustomerId, card);
  }

  // Tokenizes and saves a new card for the member, replacing whatever card
  // they had before. The Mercado Pago customer lookup/creation and the card
  // tokenization happen first, outside the transaction, since neither
  // touches this database — only the deactivate-previous/insert-new pair
  // needs to be atomic.
  async saveForUser(userId: number, email: string, cardToken: string) {
    const customer = await this.mercadoPagoClient.findOrCreateCustomer(email);
    const mpCard = await this.mercadoPagoClient.saveCard(
      customer.id,
      cardToken,
    );

    if (
      mpCard.lastFourDigits === undefined ||
      mpCard.paymentMethodId === undefined ||
      mpCard.expirationMonth === undefined ||
      mpCard.expirationYear === undefined
    ) {
      // A malformed success response — see MercadoPagoUnavailableError's own
      // doc comment. Refusing to write a half-populated row is safer than
      // guessing at defaults for fields that identify a real payment method.
      throw new MercadoPagoUnavailableError(
        'Mercado Pago did not return complete card details.',
      );
    }

    return this.persistCard(userId, customer.id, {
      id: mpCard.id,
      lastFourDigits: mpCard.lastFourDigits,
      paymentMethodId: mpCard.paymentMethodId,
      expirationMonth: mpCard.expirationMonth,
      expirationYear: mpCard.expirationYear,
      // The classic Customers API's card-creation response carries no
      // credit/debit type. A card saved through this path is not chargeable
      // by the renewal cron until the member goes through checkout's
      // save-card flow instead (Task 9), which does capture it.
      paymentTypeId: null,
    });
  }

  // The member's current card, or null if they have none — a normal state,
  // not an error. userId comes from the JWT in every caller — never accept
  // one as a parameter here or anyone could read another member's card.
  async findActiveForUser(userId: number) {
    return this.savedCardRepository.findOne({
      where: { userId, active: true, deleted: false },
    });
  }

  // Deactivates the member's card and turns autoRenew off on every one of
  // their subscriptions that had it on — auto-renewal without a card is a
  // promise the system cannot keep. Scoped by BOTH the card id and the JWT's
  // userId — never by card id alone, or one member could deactivate
  // another's card by guessing/incrementing an id.
  async removeForUser(id: number, userId: number) {
    const card = await this.savedCardRepository.findOne({
      where: { id, userId, deleted: false },
    });
    if (!card) {
      throw new NotFoundException(`La tarjeta con ID: ${id} no existe.`);
    }

    card.active = false;
    card.deleted = true;
    await this.savedCardRepository.save(card);

    await this.subscriptionRepository.update(
      { userId, deleted: false, autoRenew: true },
      { autoRenew: false },
    );

    return { message: 'Eliminada correctamente' };
  }
}
