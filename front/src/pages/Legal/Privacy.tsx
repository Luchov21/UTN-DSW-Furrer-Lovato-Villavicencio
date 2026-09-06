import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';

function Privacy() {
  return (
    <LegalLayout title="Política de Privacidad y Protección de Datos Personales" updatedAt="06/09/2026">
      <p>
        En <strong>FLG Gym</strong> (en adelante, "la Plataforma" o "el
        Gimnasio") estamos profundamente comprometidos con la seguridad,
        confidencialidad y tratamiento ético de los datos personales de
        nuestros socios, clientes y usuarios (en adelante, los "Titulares" o
        "Usuarios").
      </p>
      <p>
        La presente Política de Privacidad se ajusta plenamente a las
        disposiciones de la Ley N° 25.326 de Protección de los Datos
        Personales de la República Argentina, su Decreto Reglamentario N°
        1558/2001 y las normas complementarias emitidas por la Agencia de
        Acceso a la Información Pública (AAIP), órgano de control de la
        referida norma.
      </p>

      <section>
        <h2>1. Responsable del Tratamiento de los Datos</h2>
        <p>
          El responsable del tratamiento y resguardo de las bases de datos
          generadas a través de la Plataforma es la administración de FLG Gym.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Actividad:</strong> gestión de servicios deportivos,
            acondicionamiento físico y reservas de entrenamiento.
          </li>
          <li>
            <strong>Canal de contacto de privacidad:</strong> formulario de
            contacto oficial en la Plataforma y atención presencial en la
            recepción del establecimiento.
          </li>
        </ul>
      </section>

      <section>
        <h2>2. Datos Personales que Recolectamos</h2>
        <p>
          Para brindar un servicio de alta calidad, seguro y personalizado,
          recolectamos las siguientes categorías de información:
        </p>

        <h3 className="font-display text-base font-semibold text-text">
          2.1. Datos de identificación y contacto
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nombre y apellido completo.</li>
          <li>Documento Nacional de Identidad (DNI) o documento equivalente.</li>
          <li>Dirección de correo electrónico personal.</li>
          <li>Número de teléfono celular / WhatsApp.</li>
          <li>Fecha de nacimiento y edad.</li>
          <li>
            Nombre y teléfono de un contacto de emergencia (para asistencia
            inmediata ante eventuales contingencias de salud).
          </li>
        </ul>

        <h3 className="font-display text-base font-semibold text-text">
          2.2. Datos de autenticación y seguridad
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Contraseña de acceso:</strong> almacenada exclusivamente de
            manera irreversible mediante la función criptográfica Bcrypt con un
            factor de trabajo (salt rounds) de nivel 10. Los administradores ni
            el personal del sistema pueden visualizar o descifrar su
            contraseña.
          </li>
          <li>
            <strong>Identificadores federados:</strong> en caso de iniciar
            sesión mediante Google OAuth 2.0, se recibe un token criptográfico
            validado servidor a servidor que asocia su correo autenticado, sin
            acceder a sus contraseñas ni datos privados de Google.
          </li>
        </ul>

        <h3 className="font-display text-base font-semibold text-text">
          2.3. Datos de salud y aptitud física (datos sensibles de uso
          restringido)
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Constancia de presentación, número de matrícula del médico
            otorgante y fecha de vigencia del Certificado Médico de Aptitud
            Física.
          </li>
          <li>
            Declaraciones básicas de lesiones previas o limitaciones físicas
            informadas voluntariamente por el socio a los instructores.
          </li>
        </ul>
        <p>
          <em>Tratamiento específico:</em> estos datos se tratan bajo estricta
          reserva profesional y confidencialidad médica, utilizándose
          exclusivamente para resguardar la integridad psicofísica del
          deportista y dar cumplimiento a las leyes sanitarias y deportivas
          locales.
        </p>

        <h3 className="font-display text-base font-semibold text-text">
          2.4. Datos financieros y transaccionales
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Registros de transacciones contables: fecha de pago, importe
            facturado, plan contratado, método de pago utilizado (efectivo,
            transferencia, terminal Point, QR o tarjeta online) y número de
            recibo o identificador de orden generado.
          </li>
        </ul>
        <p>
          <strong>Seguridad de medios de pago (cumplimiento PCI-DSS):</strong>{' '}
          FLG Gym no almacena ni procesa en sus servidores los números
          completos de tarjetas de crédito o débito, fechas de caducidad ni
          códigos de seguridad (CVV/CVC). El procesamiento y almacenamiento de
          datos bancarios sensibles es delegado en forma directa y exclusiva a
          la pasarela de pagos Mercado Pago, que opera bajo la certificación
          internacional PCI-DSS (Payment Card Industry Data Security Standard)
          Nivel 1.
        </p>

        <h3 className="font-display text-base font-semibold text-text">
          2.5. Datos técnicos y de navegación
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Direcciones IP de conexión (utilizadas para controles de tasa de
            peticiones y mitigación de ciberataques mediante mecanismos de
            Rate Limiting / Throttler).
          </li>
          <li>Registros técnicos de acceso HTTP y User-Agent del dispositivo.</li>
          <li>
            <strong>Tokens de sesión (JWT):</strong> uso de tokens de
            autenticación cifrados guardados en el almacenamiento local
            (localStorage) del navegador para mantener la sesión activa de
            forma segura.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Finalidad del Tratamiento de los Datos</h2>
        <p>
          Los datos personales recolectados son tratados con las siguientes
          finalidades explícitas y legítimas:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Gestión operativa del gimnasio:</strong> crear y mantener
            activa la cuenta del socio, verificar su identidad y habilitar el
            acceso a las instalaciones físicas.
          </li>
          <li>
            <strong>Reserva y administración de clases:</strong> gestionar los
            turnos en la grilla semanal, cupos máximos por sala, cancelaciones
            y reprogramaciones.
          </li>
          <li>
            <strong>Facturación y cobranza:</strong> procesar las cuotas de
            membresía, ejecutar cobros manuales o automáticos con tarjeta
            tokenizada, emitir comprobantes de recibo impresos o digitales y
            gestionar eventuales reembolsos prorrateados.
          </li>
          <li>
            <strong>Comunicaciones operativas y asistencia:</strong> enviar
            notificaciones críticas de servicio (confirmación de turnos,
            recordatorios de vencimiento de cuotas, alertas de rechazo de pago
            y respuestas a consultas enviadas por el formulario de contacto vía
            correo electrónico).
          </li>
          <li>
            <strong>Ciberseguridad y prevención de fraudes:</strong> prevenir
            ataques de fuerza bruta, accesos no autorizados a cuentas, abusos
            en la reserva de cupos e intentos de vulneración a la integridad
            del sistema.
          </li>
          <li>
            <strong>Cumplimiento legal y auditoría:</strong> conservar
            registros contables y fiscales exigidos por la legislación vigente
            y mantener la trazabilidad de operaciones financieras.
          </li>
        </ol>
      </section>

      <section>
        <h2>4. Legitimación para el Tratamiento de Datos</h2>
        <p>El tratamiento de sus datos se fundamenta en:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            La ejecución de la relación contractual, necesaria para la
            prestación de los servicios contratados conforme a los{' '}
            <Link to="/terms" className="underline">
              Términos y Condiciones
            </Link>
            .
          </li>
          <li>
            El consentimiento libre, expreso e informado del Titular prestado
            al momento del registro en la Plataforma.
          </li>
          <li>
            El cumplimiento de obligaciones legales y reglamentarias: registros
            impositivos, contables y normativas de control sanitario de
            establecimientos deportivos.
          </li>
          <li>
            El interés legítimo de seguridad: garantizar la integridad física
            de las personas dentro del establecimiento y la seguridad
            informática de la infraestructura tecnológica.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Destinatarios y Transferencia de Información</h2>
        <p>
          FLG Gym no comercializa, vende, arrienda ni cede datos personales a
          terceras partes bajo ningún concepto con fines publicitarios o
          ajenos a la operación.
        </p>
        <p>
          Los datos podrán ser transmitidos únicamente a los siguientes
          proveedores de servicios indispensables (Encargados del
          Tratamiento):
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Mercado Pago (MercadoLibre S.R.L.):</strong> para el
            procesamiento de pagos presenciales (terminales Point / Códigos QR)
            y virtuales (tarjetas tokenizadas y suscripciones automáticas).
          </li>
          <li>
            <strong>Google LLC:</strong> para la provisión opcional de
            autenticación federada (OAuth 2.0).
          </li>
          <li>
            <strong>Servicios de correo electrónico transaccional:</strong>{' '}
            para el despacho automatizado de confirmaciones de pago y
            notificaciones operativas.
          </li>
          <li>
            <strong>Autoridades públicas competentes:</strong> cuando exista un
            requerimiento judicial vinculante o mandamiento fundado en la
            legislación argentina.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Medidas de Seguridad de la Información</h2>
        <p>
          En concordancia con el artículo 9 de la Ley N° 25.326 y los
          estándares de la industria, FLG Gym aplica rigurosas medidas técnicas
          y organizativas para preservar la confidencialidad, integridad y
          disponibilidad de la información:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <strong>Cifrado en tránsito:</strong> todo el tráfico entre el
            navegador del usuario y los servidores web viaja encriptado
            mediante protocolo seguro HTTPS/TLS.
          </li>
          <li>
            <strong>Cifrado de contraseñas (Bcrypt):</strong> las credenciales
            jamás se guardan en texto plano; se utiliza salting criptográfico
            individual para neutralizar ataques basados en tablas arcoíris
            (rainbow tables).
          </li>
          <li>
            <strong>
              Tokens JWT criptográficos y control de acceso por roles (RBAC):
            </strong>{' '}
            cada petición a endpoints protegidos es validada mediante firmas
            digitales no manipulables, aplicando directivas estrictas de
            privilegios mínimos.
          </li>
          <li>
            <strong>Protección contra accesos indebidos (IDOR):</strong> las
            consultas a información personal o transaccional se vinculan de
            manera forzosa a la identidad contenida en el token del socio,
            impidiendo que un usuario pueda visualizar los datos o pagos de
            otro socio manipulando identificadores en la URL.
          </li>
          <li>
            <strong>Mitigación de fuerza bruta y DoS (Throttler):</strong> el
            sistema limita automáticamente la cantidad de solicitudes
            consecutivas permitidas por dirección IP en rutas críticas como el
            inicio de sesión.
          </li>
          <li>
            <strong>Cabeceras de seguridad avanzadas (Helmet):</strong>{' '}
            implementación de cabeceras HTTP que inhiben ataques de
            Cross-Site Scripting (XSS), secuestro de clics (Clickjacking) y
            deducción forzada de tipos MIME.
          </li>
          <li>
            <strong>Eliminación lógica (soft delete) y auditoría:</strong> los
            registros de pagos y operaciones eliminados no se destruyen
            físicamente de forma inmediata; se asienta su baja lógica para
            garantizar la trazabilidad contable requerida en auditorías y
            evitar maniobras fraudulentas.
          </li>
        </ol>
      </section>

      <section>
        <h2>7. Plazos de Conservación de los Datos</h2>
        <p>
          Los datos personales serán conservados mientras el Titular mantenga
          su condición de socio activo en FLG Gym. Finalizada la membresía o
          solicitada la baja, la información será archivada o bloqueada
          durante los plazos legalmente exigidos por el Código Civil y
          Comercial de la Nación y las leyes impositivas para la prescripción
          de acciones contractuales y tributarias, luego de lo cual serán
          suprimidos o anonimizados de manera definitiva.
        </p>
      </section>

      <section>
        <h2>8. Derechos del Titular de los Datos (Derechos ARCO)</h2>
        <p>
          De conformidad con la Ley N° 25.326, los Titulares de los datos
          tienen derecho a:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Derecho de acceso:</strong> obtener confirmación sobre el
            tratamiento de sus datos y acceder a la información almacenada en
            forma gratuita a intervalos no inferiores a seis meses (o con
            menor antelación mediando interés legítimo). En la Plataforma, el
            socio puede ejercer este derecho de manera inmediata y continua
            accediendo a su panel personal y a la sección de historial de
            pagos.
          </li>
          <li>
            <strong>Derecho de rectificación y actualización:</strong> corregir
            datos inexactos, desactualizados o incompletos directamente desde
            su panel de socio o solicitándolo en el mostrador.
          </li>
          <li>
            <strong>Derecho de supresión:</strong> solicitar la eliminación de
            sus datos personales cuando hayan dejado de ser necesarios para los
            fines por los que fueron recabados, sujeto a las excepciones
            legales (ej. conservación obligatoria de registros de pago y
            facturación).
          </li>
          <li>
            <strong>Derecho de revocación:</strong> retirar el consentimiento
            otorgado previamente para renovaciones automáticas desvinculando la
            tarjeta guardada desde su perfil.
          </li>
        </ul>
        <p>
          Para canalizar cualquiera de estas solicitudes, el Titular puede
          presentar una nota simple por escrito en la sede del gimnasio o
          remitir un mensaje a través del formulario oficial de contacto
          disponible en la web, acreditando debidamente su identidad mediante
          copia de DNI.
        </p>
      </section>

      <section>
        <h2>
          9. Aviso Legal Obligatorio — Agencia de Acceso a la Información
          Pública (AAIP)
        </h2>
        <p>
          En cumplimiento de la Disposición 10/2008 de la Dirección Nacional de
          Protección de Datos Personales:
        </p>
        <blockquote className="border-l-2 border-border pl-4 italic">
          "El titular de los datos personales tiene la facultad de ejercer el
          derecho de acceso a los mismos en forma gratuita a intervalos no
          inferiores a seis meses, salvo que se acredite un interés legítimo al
          efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          Nº 25.326."
          <br />
          <br />
          "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de
          Órgano de Control de la Ley Nº 25.326, tiene la atribución de
          atender las denuncias y reclamos que se interpongan con relación al
          incumplimiento de las normas sobre protección de datos personales."
        </blockquote>
        <p>
          Sitio web del órgano de control:{' '}
          <a
            href="https://www.argentina.gob.ar/aaip/datospersonales"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            argentina.gob.ar/aaip/datospersonales
          </a>
        </p>
      </section>

      <section>
        <h2>10. Modificaciones a la Presente Política</h2>
        <p>
          FLG Gym se reserva el derecho de actualizar la presente Política de
          Privacidad para adecuarla a novedades regulatorias, mejoras en la
          infraestructura tecnológica o cambios en el modelo operativo. Cada
          actualización será informada publicando la fecha de última revisión
          en la parte superior del documento y/o mediante aviso en la
          Plataforma. El acceso o uso posterior a las modificaciones
          constituirá la aceptación tácita de las mismas.
        </p>
      </section>
    </LegalLayout>
  );
}

export default Privacy;
