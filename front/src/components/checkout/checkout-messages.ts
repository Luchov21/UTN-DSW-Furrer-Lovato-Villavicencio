// Mercado Pago's status_detail, turned into something a member can act on.
// Mercado Pago adds codes over time, so an unknown one must degrade to a
// useful sentence — never to a blank banner or a raw code.
export const FALLBACK_DECLINE_MESSAGE =
  'Tu tarjeta fue rechazada por el banco emisor. Revisá tu saldo o probá con otra tarjeta.';

const DECLINE_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount:
    'Tu tarjeta no tiene fondos suficientes. Probá con otra tarjeta o comunicate con tu banco.',
  cc_rejected_bad_filled_security_code:
    'El código de seguridad es incorrecto. Revisalo y volvé a intentar.',
  cc_rejected_bad_filled_date:
    'La fecha de vencimiento es incorrecta. Revisala y volvé a intentar.',
  cc_rejected_bad_filled_card_number:
    'El número de tarjeta es incorrecto. Revisalo y volvé a intentar.',
  cc_rejected_bad_filled_other:
    'Revisá los datos de la tarjeta: alguno no coincide con los de tu banco.',
  cc_rejected_call_for_authorize:
    'Tu banco necesita autorizar este pago. Llamalos y volvé a intentar.',
  cc_rejected_card_disabled:
    'Tu tarjeta está inactiva. Llamá a tu banco para activarla o probá con otra.',
  cc_rejected_card_error:
    'No pudimos procesar tu tarjeta. Volvé a intentar o probá con otra.',
  cc_rejected_duplicated_payment:
    'Ya registramos un pago por este monto. Revisá tu panel antes de volver a intentar.',
  cc_rejected_high_risk:
    'Tu banco rechazó el pago por seguridad. Probá con otra tarjeta.',
  cc_rejected_max_attempts:
    'Llegaste al límite de intentos con esta tarjeta. Probá con otra.',
  cc_rejected_blacklist:
    'Tu banco rechazó el pago. Comunicate con ellos o probá con otra tarjeta.',
};

export const IN_PROCESS_MESSAGE =
  'Tu pago está siendo procesado. Te avisamos por email en cuanto se confirme.';

export function declineMessage(statusDetail?: string): string {
  if (!statusDetail) {
    return FALLBACK_DECLINE_MESSAGE;
  }
  return DECLINE_MESSAGES[statusDetail] ?? FALLBACK_DECLINE_MESSAGE;
}
