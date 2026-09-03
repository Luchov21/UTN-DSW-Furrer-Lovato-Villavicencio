import LegalLayout from './LegalLayout';

// TODO(luciano): replace this placeholder copy with the real privacy
// policy. The layout is final; only the text between the headings changes.
function Privacy() {
  return (
    <LegalLayout title="Política de Privacidad" updatedAt="02/09/2026">
      <section>
        <h2>1. Qué datos recopilamos</h2>
        <p>
          Recopilamos los datos que nos brindás al registrarte y completar tu
          perfil, como nombre, DNI, correo electrónico, teléfono y fecha de
          nacimiento, además de la información sobre tu plan de membresía y tu
          historial de pagos.
        </p>
      </section>
      <section>
        <h2>2. Para qué los usamos</h2>
        <p>
          Usamos tus datos para gestionar tu membresía, procesar pagos,
          identificarte en el ingreso al gimnasio, enviarte comunicaciones
          sobre tu cuenta y clases, y cumplir con obligaciones legales e
          impositivas.
        </p>
      </section>
      <section>
        <h2>3. Con quién los compartimos</h2>
        <p>
          Compartimos los datos necesarios para procesar tu pago con Mercado
          Pago, que actúa como procesador de pagos. No vendemos ni cedemos tus
          datos personales a terceros con fines comerciales.
        </p>
      </section>
      <section>
        <h2>4. Cómo ejercer tus derechos</h2>
        <p>
          Podés acceder, rectificar o solicitar la eliminación de tus datos
          personales escribiéndonos desde tu panel de usuario o contactándonos
          por los medios que figuran en la sección de contacto del sitio.
        </p>
      </section>
    </LegalLayout>
  );
}

export default Privacy;
