import LegalLayout from './LegalLayout';

// TODO(luciano): replace this placeholder copy with the real terms. The
// layout is final; only the text between the headings changes.
function Terms() {
  return (
    <LegalLayout title="Términos y Condiciones" updatedAt="02/09/2026">
      <section>
        <h2>1. Objeto</h2>
        <p>
          Estos términos regulan la contratación de planes de membresía de FLG
          a través de este sitio. Al contratar un plan aceptás estas
          condiciones en su totalidad.
        </p>
      </section>
      <section>
        <h2>2. Contratación y pago</h2>
        <p>
          El plan se activa una vez acreditado el pago. Los precios se expresan
          en pesos argentinos e incluyen los impuestos aplicables.
        </p>
      </section>
      <section>
        <h2>3. Renovación automática</h2>
        <p>
          Si guardaste una tarjeta y activaste la renovación automática,
          autorizás débitos mensuales por el valor vigente de tu plan. Podés
          desactivarla en cualquier momento desde tu panel.
        </p>
      </section>
      <section>
        <h2>4. Cancelaciones y reintegros</h2>
        <p>
          Podés cancelar tu membresía cuando quieras desde tu panel. Los
          reintegros se calculan de forma proporcional a los meses no
          consumidos.
        </p>
      </section>
    </LegalLayout>
  );
}

export default Terms;
