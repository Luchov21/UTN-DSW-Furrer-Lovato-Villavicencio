import LegalLayout from './LegalLayout';

// TODO(luciano): replace this placeholder copy with the real rules. The
// layout is final; only the text between the headings changes.
function Rules() {
  return (
    <LegalLayout title="Reglamento de Uso" updatedAt="02/09/2026">
      <section>
        <h2>1. Acceso e identificación</h2>
        <p>
          El ingreso a las instalaciones se realiza acreditando la membresía
          vigente. La credencial de socio es personal e intransferible; el
          préstamo a terceros puede derivar en la suspensión de la cuenta.
        </p>
      </section>
      <section>
        <h2>2. Uso de las instalaciones</h2>
        <p>
          Cada equipo debe utilizarse conforme a su función y devolverse a su
          lugar luego de usarlo. Pedimos respetar los tiempos de uso en horarios
          de alta demanda y reportar cualquier desperfecto al personal.
        </p>
      </section>
      <section>
        <h2>3. Higiene y vestimenta</h2>
        <p>
          Es obligatorio el uso de ropa y calzado deportivo adecuados, y se
          recomienda utilizar una toalla propia durante el entrenamiento. Por
          higiene, pedimos limpiar los equipos después de cada uso.
        </p>
      </section>
      <section>
        <h2>4. Reserva de clases</h2>
        <p>
          Las clases grupales se reservan desde tu panel con anticipación y
          cupo limitado. Si no podés asistir, cancelá tu lugar con tiempo para
          que otro socio pueda ocuparlo.
        </p>
      </section>
      <section>
        <h2>5. Conducta</h2>
        <p>
          Esperamos un trato respetuoso hacia el resto de los socios y el
          personal. Actitudes que pongan en riesgo la seguridad o la
          convivencia pueden derivar en la suspensión de la membresía.
        </p>
      </section>
    </LegalLayout>
  );
}

export default Rules;
