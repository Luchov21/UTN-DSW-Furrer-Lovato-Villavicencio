import { describe, expect, it } from 'vitest';
import { buildFreePassMessage, validateFreePass } from './useFreePassForm';

describe('validateFreePass', () => {
  it('accepts a name and a ten-digit phone', () => {
    expect(
      validateFreePass({ name: 'Ana Ruiz', phone: '3412724611', goal: '' }),
    ).toEqual({});
  });

  it('requires a name', () => {
    const errors = validateFreePass({
      name: '  ',
      phone: '3412724611',
      goal: '',
    });
    expect(errors.name).toBe('Escribí tu nombre y apellido.');
  });

  it('requires a phone number', () => {
    const errors = validateFreePass({ name: 'Ana', phone: '', goal: '' });
    expect(errors.phone).toBe('Escribí tu número de WhatsApp.');
  });

  it('rejects a phone with too few digits', () => {
    const errors = validateFreePass({ name: 'Ana', phone: '341272', goal: '' });
    expect(errors.phone).toBe('El número tiene que tener al menos 8 dígitos.');
  });

  it('ignores spaces, dashes and parentheses when counting digits', () => {
    expect(
      validateFreePass({ name: 'Ana', phone: '(341) 272-4611', goal: '' }),
    ).toEqual({});
  });

  it('does not require a goal', () => {
    expect(
      validateFreePass({ name: 'Ana', phone: '3412724611', goal: '' }).goal,
    ).toBeUndefined();
  });
});

describe('buildFreePassMessage', () => {
  it('names the visitor and their number', () => {
    const message = buildFreePassMessage({
      name: 'Ana Ruiz',
      phone: '3412724611',
      goal: '',
    });

    expect(message).toBe(
      '¡Hola! Soy Ana Ruiz y quiero mi pase gratis de 1 día. Mi WhatsApp es 3412724611.',
    );
  });

  it('appends the goal when one was chosen', () => {
    const message = buildFreePassMessage({
      name: 'Ana Ruiz',
      phone: '3412724611',
      goal: 'Descenso de peso',
    });

    expect(message).toBe(
      '¡Hola! Soy Ana Ruiz y quiero mi pase gratis de 1 día. Mi WhatsApp es 3412724611. Mi objetivo es: Descenso de peso.',
    );
  });

  it('trims stray whitespace so the message does not double-space', () => {
    const message = buildFreePassMessage({
      name: '  Ana Ruiz  ',
      phone: ' 3412724611 ',
      goal: '',
    });

    expect(message).toContain('Soy Ana Ruiz y');
    expect(message).toContain('es 3412724611.');
  });
});
