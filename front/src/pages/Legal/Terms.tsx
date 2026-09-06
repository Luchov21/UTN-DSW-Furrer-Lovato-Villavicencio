import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';

function Terms() {
  return (
    <LegalLayout title="Términos y Condiciones de Uso del Servicio" updatedAt="06/09/2026">
      <p>
        Bienvenido/a a <strong>FLG Gym</strong> (en adelante, "la Plataforma" o "el
        Gimnasio"). Los presentes Términos y Condiciones regulan la relación
        contractual entre cualquier persona que acceda, se registre o contrate
        servicios a través de nuestra plataforma web (en adelante, el "Usuario",
        "Socio" o "Cliente") y los titulares y administradores de FLG Gym.
      </p>
      <p>
        Al registrarse, iniciar sesión o utilizar cualquier funcionalidad de la
        Plataforma, usted declara haber leído, comprendido y aceptado en su
        totalidad y sin reservas estos Términos y Condiciones, así como la{' '}
        <Link to="/privacy" className="underline">
          Política de Privacidad
        </Link>{' '}
        y el{' '}
        <Link to="/rules" className="underline">
          Reglamento de Uso
        </Link>{' '}
        del establecimiento.
      </p>

      <section>
        <h2>1. Objeto y Alcance del Servicio</h2>
        <p>
          FLG Gym proporciona una solución tecnológica integral orientada a la
          administración y operación de servicios de entrenamiento físico,
          actividades deportivas y bienestar corporal.
        </p>
        <p>A través de la Plataforma, los Socios pueden:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Gestionar su cuenta de usuario y perfil personal.</li>
          <li>
            Consultar la oferta de actividades, disciplinas y grilla de horarios
            semanales.
          </li>
          <li>
            Reservar, reprogramar o cancelar cupos en clases grupales y turnos
            de entrenamiento.
          </li>
          <li>
            Suscribirse a planes de membresía periódicos o adquirir pases de
            entrenamiento.
          </li>
          <li>Registrar métodos de pago para renovación automática de membresías.</li>
          <li>Abonar cuotas y aranceles mediante pasarelas electrónicas o presenciales.</li>
          <li>
            Acceder y consultar en cualquier momento su historial contable y
            transaccional personal.
          </li>
        </ul>
        <p>
          La contratación de cualquier plan o servicio a través de la Plataforma
          da derecho al uso de las instalaciones físicas de FLG Gym y/o a la
          participación en las actividades contratadas, sujeto al cumplimiento
          estricto del{' '}
          <Link to="/rules" className="underline">
            Reglamento de Uso
          </Link>{' '}
          y las condiciones sanitarias vigentes.
        </p>
      </section>

      <section>
        <h2>2. Capacidad Legal y Registro de Cuenta</h2>
        <p>
          <strong>Capacidad Legal:</strong> el uso de la Plataforma y la
          contratación de membresías está reservado exclusivamente para
          personas humanas con plena capacidad legal para contratar según el
          Código Civil y Comercial de la Nación Argentina (mayores de 18 años).
          Los menores de edad comprendidos entre los 13 y 17 años podrán ser
          dados de alta únicamente bajo la representación, autorización expresa
          y asunción de responsabilidad civil y patrimonial por parte de sus
          padres, tutores o representantes legales.
        </p>
        <p>
          <strong>Veracidad de la información:</strong> al registrarse, el
          Usuario se compromete a proporcionar información fidedigna, completa,
          exacta y actualizada (incluyendo nombre y apellido, Documento Nacional
          de Identidad - DNI, dirección de correo electrónico válida, número
          telefónico y contacto de emergencia). FLG Gym se reserva el derecho de
          suspender o inhabilitar cuentas que contengan datos falsos,
          inconsistentes o usurpados.
        </p>
        <p>
          <strong>Credenciales y seguridad:</strong> el acceso a la cuenta puede
          realizarse mediante autenticación propia (correo electrónico y
          contraseña protegida con cifrado unidireccional Bcrypt) o a través de
          autenticación federada con Google OAuth 2.0. Las credenciales de
          acceso son de carácter personal, confidencial e intransferible. El
          Usuario asume total responsabilidad por cualquier actividad, reserva o
          transacción realizada bajo su cuenta, comprometiéndose a notificar
          fehacientemente a FLG Gym ante cualquier sospecha de vulneración,
          extravío o uso indebido de sus datos de acceso.
        </p>
      </section>

      <section>
        <h2>3. Planes, Membresías y Suscripciones</h2>
        <p>
          <strong>Modalidades de planes:</strong> FLG Gym ofrece distintos
          planes de entrenamiento (planes mensuales, trimestrales, pases libres
          o pases por cantidad de clases semanales). Las características,
          vigencias, cupos de clases incluidos, límites de cambios de clase
          mensuales y tarifas de cada plan se detallan de forma clara en la
          Plataforma antes de su confirmación.
        </p>
        <p>
          <strong>Asignación de cupos y clases semanales:</strong> las clases
          cuentan con cupos limitados para garantizar la calidad del
          entrenamiento y la seguridad biomecánica de los participantes. La
          inscripción en una grilla semanal reserva el horario de manera
          periódica mientras la suscripción permanezca activa y con pago al
          día. Cada plan estipula un límite máximo de modificaciones o
          reprogramaciones de clase que el Socio puede realizar por mes
          calendario.
        </p>
        <p>
          <strong>Pausa de membresía:</strong> el Socio que se encuentre al día
          con sus cuotas podrá solicitar la suspensión temporal (pausa) de su
          suscripción a través del panel o en el mostrador de administración. La
          pausa está sujeta a los topes máximos de días consecutivos y anuales
          definidos en la política comercial del plan contratado. Cumplido el
          plazo máximo de pausa, la membresía y sus obligaciones de cobro se
          reanudarán automáticamente.
        </p>
      </section>

      <section>
        <h2>4. Condiciones de Pago, Cobros y Renovaciones</h2>
        <p>
          <strong>Moneda y tarifas:</strong> todos los precios y aranceles
          publicados en la Plataforma se encuentran expresados en Pesos
          Argentinos ($ ARS) e incluyen los tributos correspondientes que
          resulten aplicables. FLG Gym se reserva el derecho de actualizar los
          valores de las cuotas y planes, notificando las variaciones a los
          Socios con una antelación razonable a través de la Plataforma o
          correo electrónico.
        </p>
        <p>
          <strong>Medios de pago habilitados:</strong>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Cobro online (pasarela Mercado Pago):</strong> tarjetas de
            crédito y débito bancarias mediante pasarela segura bajo protocolo
            PCI-DSS.
          </li>
          <li>
            <strong>Cobro presencial en mostrador:</strong> dinero en efectivo o
            transferencia bancaria inmediata, con emisión de comprobante de
            recibo contable; tarjetas físicas mediante terminal Mercado Pago
            Point con impresión física instantánea de recibo; escaneo de código
            QR (dinámico o estático) a través de la aplicación de Mercado Pago
            u otras billeteras virtuales interoperables.
          </li>
        </ul>
        <p>
          <strong>Tarjeta guardada y renovación automática:</strong> el Socio
          puede optar por adherir una tarjeta de crédito o débito a débito
          recurrente para la renovación mensual automática de su membresía. Los
          datos de la tarjeta son tokenizados directamente por Mercado Pago; los
          servidores de FLG Gym nunca almacenan números completos de tarjeta ni
          códigos de seguridad (CVV). Un proceso automatizado (cron nocturno)
          procesa el cobro antes del vencimiento del ciclo de suscripción. En
          caso de rechazo o fondos insuficientes, el sistema ejecutará
          reintentos automáticos programados y enviará alertas por correo
          electrónico para que el Socio regularice su situación.
        </p>
        <p>
          <strong>Mora y suspensión de acceso:</strong> la falta de pago de la
          cuota al término de su vencimiento producirá la mora automática. El
          sistema inhabilitará temporalmente el derecho a reservar clases y el
          ingreso físico a las instalaciones del gimnasio hasta la acreditación
          efectiva del monto adeudado.
        </p>
      </section>

      <section>
        <h2>5. Derecho de Revocación, Reembolsos y Bajas</h2>
        <p>
          <strong>Derecho de arrepentimiento (Ley N° 24.240):</strong> para
          contrataciones realizadas exclusivamente por vía electrónica o
          remota, el Cliente tiene derecho a revocar la aceptación del servicio
          dentro del plazo de diez (10) días corridos contados a partir de la
          fecha de contratación, siempre que no haya hecho uso efectivo de las
          instalaciones ni concurrido a clases. En dicho caso, se reintegrará la
          totalidad de las sumas abonadas mediante el mismo medio de pago
          utilizado.
        </p>
        <p>
          <strong>Baja voluntaria de la suscripción:</strong> el Socio puede
          solicitar la baja o no renovación de su plan en cualquier momento
          desde el panel de usuario o comunicándolo por escrito en
          administración. La baja surtirá efecto para el ciclo de facturación
          siguiente, pudiendo el Socio disfrutar del servicio hasta la fecha de
          vencimiento del período ya abonado.
        </p>
        <p>
          <strong>Política de reembolsos por cancelación anticipada:</strong> en
          caso de planes de plazo extendido (semestrales/anuales) cancelados
          anticipadamente por causa justificada, el reembolso se calculará de
          manera prorrateada en función del tiempo efectivamente transcurrido.
          Para el cálculo de liquidación de reintegro, los períodos mensuales
          consumidos se recalcularán al valor de la tarifa mensual regular
          vigente sin las bonificaciones o descuentos aplicados al paquete
          contratado. Los reembolsos por pagos efectuados con tarjeta se
          tramitarán a través de la pasarela Mercado Pago; los efectuados en
          efectivo se liquidarán en el mostrador administrativo.
        </p>
      </section>

      <section>
        <h2>6. Reserva de Clases, Puntualidad e Inasistencias</h2>
        <p>
          La concurrencia a clases y actividades grupales exige reserva previa
          obligatoria a través de la Plataforma.
        </p>
        <p>
          Si el Socio no pudiere asistir a una clase previamente reservada,
          deberá cancelarla en la Plataforma con una antelación mínima de{' '}
          <strong>dos (2) horas</strong> respecto al horario de inicio
          programado. Esto permite la liberación inmediata del cupo para otros
          Socios en lista de espera.
        </p>
        <p>
          La inasistencia injustificada sin cancelación previa perjudica el
          derecho de otros socios a entrenar. Si un Socio incurre en más de
          tres (3) inasistencias en un mismo mes, FLG Gym podrá aplicar
          suspensiones temporales a su facultad de reservar clases en horarios
          pico por un lapso de hasta siete (7) días corridos.
        </p>
      </section>

      <section>
        <h2>7. Aptitud Médica, Salud y Deslinde de Responsabilidad</h2>
        <p>
          <strong>Certificado médico de aptitud física obligatorio:</strong> en
          concordancia con las regulaciones sanitarias y deportivas aplicables a
          establecimientos de actividad física, es requisito inexcusable para
          todos los Socios presentar un Certificado Médico de Aptitud Física
          vigente, suscripto por un médico matriculado, que avale su capacidad
          para la realización de esfuerzos corporales. El certificado deberá
          renovarse de manera anual (o con la periodicidad requerida por la
          normativa municipal/provincial correspondiente). FLG Gym se reserva el
          derecho de impedir el acceso físico o la reserva de clases de alto
          impacto a cualquier Socio que mantenga su certificado vencido o
          ausente.
        </p>
        <p>
          <strong>Declaración del Usuario:</strong> el Socio manifiesta
          expresamente encontrarse en adecuadas condiciones de salud física y
          mental para la realización de actividad deportiva y se compromete a
          no someter su organismo a exigencias que excedan su capacidad.
          Cualquier patología preexistente, lesión, condición cardiovascular o
          embarazo debe ser declarada al personal técnico del gimnasio.
        </p>
        <p>
          <strong>Exoneración de responsabilidad:</strong> el Socio asume
          voluntariamente los riesgos inherentes a la práctica de disciplinas
          deportivas y esfuerzo físico. FLG Gym, sus titulares, profesores y
          personal quedan liberados de toda responsabilidad civil, patrimonial o
          extracontractual por lesiones, accidentes o afecciones físicas
          originadas en: (a) negligencia, imprudencia o impericia del propio
          Socio; (b) desobediencia a las instrucciones o correcciones de los
          profesores; (c) uso indebido, destructivo o inadecuado de las
          máquinas y pesas; o (d) ocultamiento u omisión de enfermedades
          preexistentes en los antecedentes de salud.
        </p>
      </section>

      <section>
        <h2>8. Propiedad Intelectual y Uso del Software</h2>
        <p>
          Todo el contenido presente en la Plataforma, incluyendo el diseño de
          interfaz, código fuente (React, NestJS, TypeScript), logotipos,
          textos, gráficos, interfaces y bases de datos, es propiedad exclusiva
          de FLG Gym o de sus respectivos titulares y se encuentra protegido por
          las leyes de propiedad intelectual y derechos de autor de la
          República Argentina y convenios internacionales.
        </p>
        <p>
          Queda estrictamente prohibida la ingeniería inversa, descompilación,
          extracción automatizada de datos (web scraping), copia, distribución
          o comercialización del software sin la debida autorización escrita de
          sus desarrolladores.
        </p>
      </section>

      <section>
        <h2>9. Seguridad y Protección de Datos</h2>
        <p>
          El tratamiento de los datos personales suministrados a través de la
          Plataforma se realiza bajo los más rigurosos estándares de seguridad
          informática y en cabal cumplimiento de la Ley N° 25.326 de Protección
          de los Datos Personales. Para conocer los detalles de cómo se procesa
          y protege su información, consulte nuestra{' '}
          <Link to="/privacy" className="underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>10. Modificaciones a los Términos y Condiciones</h2>
        <p>
          FLG Gym se reserva el derecho de modificar o actualizar
          unilateralmente los presentes Términos y Condiciones en cualquier
          momento, con el fin de adaptarlos a mejoras operativas, lanzamientos
          de nuevas funcionalidades o cambios regulatorios.
        </p>
        <p>
          Las modificaciones entrarán en vigencia a partir de su publicación en
          la Plataforma. El uso continuado del servicio con posterioridad a la
          entrada en vigor de los cambios implicará la aceptación plena de los
          nuevos términos.
        </p>
      </section>

      <section>
        <h2>11. Ley Aplicable y Jurisdicción</h2>
        <p>
          Los presentes Términos y Condiciones se rigen e interpretan conforme
          a las leyes de la República Argentina.
        </p>
        <p>
          Ante cualquier controversia, litigio o reclamo derivado de la
          interpretación, validez o ejecución del presente contrato, las partes
          acuerdan someterse a la competencia de los Tribunales Ordinarios en lo
          Comercial de la jurisdicción correspondiente al domicilio del
          establecimiento, con expresa renuncia a cualquier otro fuero o
          jurisdicción que pudiera corresponder.
        </p>
      </section>

      <p>
        Para cualquier consulta, reclamo o solicitud vinculada a estos Términos
        y Condiciones, los Usuarios pueden comunicarse a través de nuestro
        formulario de contacto en la Plataforma o personalmente en la
        recepción de FLG Gym.
      </p>
    </LegalLayout>
  );
}

export default Terms;
