import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SavedCardService } from './savedCard.service';
import { SavedCard } from './entity/savedCard.entity';
import { Subscription } from '../subscription/entity/subscription.entity';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
} from '../mercadopago/mercadopago.client';

describe('SavedCardService.saveForUser', () => {
  let service: SavedCardService;
  let savedCardRepository: { manager: { transaction: jest.Mock } };
  let subscriptionRepository: { update: jest.Mock };
  let mercadoPagoClient: {
    findOrCreateCustomer: jest.Mock;
    saveCard: jest.Mock;
  };
  let manager: { update: jest.Mock; create: jest.Mock; save: jest.Mock };

  const buildService = async () => {
    manager = {
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
    };
    savedCardRepository = {
      manager: {
        transaction: jest.fn((cb: (manager: unknown) => unknown) =>
          cb(manager),
        ),
      },
    };
    subscriptionRepository = { update: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SavedCardService,
        {
          provide: getRepositoryToken(SavedCard),
          useValue: savedCardRepository,
        },
        {
          provide: getRepositoryToken(Subscription),
          useValue: subscriptionRepository,
        },
        { provide: MercadoPagoClient, useValue: mercadoPagoClient },
      ],
    }).compile();

    service = moduleRef.get(SavedCardService);
  };

  it('deactivates the previous active card and inserts the new one in the same transaction', async () => {
    mercadoPagoClient = {
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      saveCard: jest.fn().mockResolvedValue({
        id: 'card-1',
        lastFourDigits: '1234',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      }),
    };
    await buildService();

    const result = await service.saveForUser(7, 'member@example.com', 'tok-1');

    expect(mercadoPagoClient.findOrCreateCustomer).toHaveBeenCalledWith(
      'member@example.com',
    );
    expect(mercadoPagoClient.saveCard).toHaveBeenCalledWith('cust-1', 'tok-1');
    expect(savedCardRepository.manager.transaction).toHaveBeenCalled();
    // Deactivation and insertion both went through the SAME manager passed
    // into the transaction callback, not the outer repository — that's what
    // makes them atomic.
    expect(manager.update).toHaveBeenCalledWith(
      SavedCard,
      { userId: 7, active: true, deleted: false },
      { active: false },
    );
    expect(manager.create).toHaveBeenCalledWith(
      SavedCard,
      expect.objectContaining({
        userId: 7,
        mpCustomerId: 'cust-1',
        mpCardId: 'card-1',
        lastFourDigits: '1234',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
        active: true,
        deleted: false,
      }),
    );
    expect(manager.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 1, mpCardId: 'card-1' }),
    );
  });

  it("reads paymentTypeId from Mercado Pago's response instead of hardcoding null", async () => {
    // The classic Customers API DOES return payment_method.payment_type_id —
    // MercadoPagoClient.saveCard maps it onto MpSavedCard.paymentTypeId, and
    // this must be persisted, not discarded. Otherwise a card saved through
    // this dashboard "replace card" flow is permanently unchargeable by
    // isChargeable, even when it deactivated a working, chargeable card.
    mercadoPagoClient = {
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      saveCard: jest.fn().mockResolvedValue({
        id: 'card-1',
        lastFourDigits: '1234',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
        expirationMonth: 12,
        expirationYear: 2030,
      }),
    };
    await buildService();

    await service.saveForUser(7, 'member@example.com', 'tok-1');

    expect(manager.create).toHaveBeenCalledWith(
      SavedCard,
      expect.objectContaining({ paymentTypeId: 'credit_card' }),
    );
  });

  it('falls back to null when Mercado Pago genuinely omits the payment type', async () => {
    mercadoPagoClient = {
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      saveCard: jest.fn().mockResolvedValue({
        id: 'card-1',
        lastFourDigits: '1234',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      }),
    };
    await buildService();

    await service.saveForUser(7, 'member@example.com', 'tok-1');

    expect(manager.create).toHaveBeenCalledWith(
      SavedCard,
      expect.objectContaining({ paymentTypeId: null }),
    );
  });

  it('refuses to save a card when Mercado Pago omits card details', async () => {
    // A malformed success response — id present, everything else missing —
    // must not silently write a half-populated row.
    mercadoPagoClient = {
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      saveCard: jest.fn().mockResolvedValue({ id: 'card-1' }),
    };
    await buildService();

    await expect(
      service.saveForUser(7, 'member@example.com', 'tok-1'),
    ).rejects.toBeInstanceOf(MercadoPagoUnavailableError);
    expect(savedCardRepository.manager.transaction).not.toHaveBeenCalled();
  });
});

describe('SavedCardService.saveFromApprovedPayment', () => {
  let service: SavedCardService;
  let savedCardRepository: { manager: { transaction: jest.Mock } };
  let mercadoPagoClient: {
    findOrCreateCustomer: jest.Mock;
    saveCard: jest.Mock;
  };
  let manager: { update: jest.Mock; create: jest.Mock; save: jest.Mock };

  const card = {
    id: 'card-9',
    lastFourDigits: '4242',
    paymentMethodId: 'visa',
    expirationMonth: 12,
    expirationYear: 2030,
  };

  beforeEach(async () => {
    manager = {
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
    };
    savedCardRepository = {
      manager: {
        transaction: jest.fn((cb: (manager: unknown) => unknown) =>
          cb(manager),
        ),
      },
    };
    mercadoPagoClient = {
      findOrCreateCustomer: jest.fn(),
      saveCard: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SavedCardService,
        {
          provide: getRepositoryToken(SavedCard),
          useValue: savedCardRepository,
        },
        { provide: getRepositoryToken(Subscription), useValue: {} },
        { provide: MercadoPagoClient, useValue: mercadoPagoClient },
      ],
    }).compile();

    service = moduleRef.get(SavedCardService);
  });

  it('deactivates the previous active card and inserts the new one in the same transaction', async () => {
    const result = await service.saveFromApprovedPayment(7, 'cust-1', card);

    expect(savedCardRepository.manager.transaction).toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      SavedCard,
      { userId: 7, active: true, deleted: false },
      { active: false },
    );
    expect(manager.create).toHaveBeenCalledWith(
      SavedCard,
      expect.objectContaining({
        userId: 7,
        mpCustomerId: 'cust-1',
        mpCardId: 'card-9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
        active: true,
        deleted: false,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: 1, mpCardId: 'card-9' }),
    );
  });

  it('never calls Mercado Pago', async () => {
    // The whole point of this method: the checkout's charge already spent the
    // single-use token, so any second call with it fails — silently, since
    // the caller swallows failures to protect the sale.
    await service.saveFromApprovedPayment(7, 'cust-1', card);

    expect(mercadoPagoClient.findOrCreateCustomer).not.toHaveBeenCalled();
    expect(mercadoPagoClient.saveCard).not.toHaveBeenCalled();
  });
});

describe('SavedCardService.findActiveForUser', () => {
  let service: SavedCardService;
  let savedCardRepository: { findOne: jest.Mock };

  const buildService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SavedCardService,
        {
          provide: getRepositoryToken(SavedCard),
          useValue: savedCardRepository,
        },
        { provide: getRepositoryToken(Subscription), useValue: {} },
        { provide: MercadoPagoClient, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SavedCardService);
  };

  it("returns the member's active, non-deleted card", async () => {
    savedCardRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 1, userId: 7 }),
    };
    await buildService();

    const result = await service.findActiveForUser(7);

    expect(savedCardRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 7, active: true, deleted: false },
    });
    expect(result).toEqual({ id: 1, userId: 7 });
  });

  it('returns null when the member has no active card, not an error', async () => {
    savedCardRepository = { findOne: jest.fn().mockResolvedValue(null) };
    await buildService();

    const result = await service.findActiveForUser(7);

    expect(result).toBeNull();
  });
});

describe('SavedCardService.removeForUser', () => {
  let service: SavedCardService;
  let savedCardRepository: { findOne: jest.Mock; save: jest.Mock };
  let subscriptionRepository: { update: jest.Mock };

  const buildService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SavedCardService,
        {
          provide: getRepositoryToken(SavedCard),
          useValue: savedCardRepository,
        },
        {
          provide: getRepositoryToken(Subscription),
          useValue: subscriptionRepository,
        },
        { provide: MercadoPagoClient, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SavedCardService);
  };

  it("deactivates the member's own card and turns off autoRenew", async () => {
    savedCardRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 5, userId: 7, active: true, deleted: false }),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    subscriptionRepository = { update: jest.fn().mockResolvedValue(undefined) };
    await buildService();

    const result = await service.removeForUser(5, 7);

    expect(savedCardRepository.findOne).toHaveBeenCalledWith({
      where: { id: 5, userId: 7, deleted: false },
    });
    expect(savedCardRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, active: false, deleted: true }),
    );
    expect(subscriptionRepository.update).toHaveBeenCalledWith(
      { userId: 7, deleted: false, autoRenew: true },
      { autoRenew: false },
    );
    expect(result).toEqual({ message: 'Eliminada correctamente' });
  });

  it('never removes a card by id alone — scoping by the wrong userId finds nothing', async () => {
    // findOne is called with { id, userId } together, so a card id that
    // exists but belongs to someone else resolves to null exactly like a
    // nonexistent id — one member can never deactivate another's card by
    // guessing/incrementing an id.
    savedCardRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    subscriptionRepository = { update: jest.fn() };
    await buildService();

    await expect(service.removeForUser(5, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(savedCardRepository.save).not.toHaveBeenCalled();
    expect(subscriptionRepository.update).not.toHaveBeenCalled();
  });
});
