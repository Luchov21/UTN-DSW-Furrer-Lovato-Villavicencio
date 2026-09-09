import type { FormEvent } from 'react';
import { Check } from 'lucide-react';
import Container from '../common/Container';
import {
  FREE_PASS_BENEFITS,
  FREE_PASS_GOALS,
  LANDING_ANCHORS,
} from './landing.data';
import { useFreePassForm } from './useFreePassForm';

const fieldClasses =
  'w-full rounded-xl border border-border bg-background px-4 py-3 font-body text-sm text-text placeholder:text-text-muted/70 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const LeadMagnetSection = () => {
  const { values, errors, setField, submit } = useFreePassForm();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const href = submit();
    // Nothing is posted anywhere: the values only ever travel into WhatsApp.
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <section
      id={LANDING_ANCHORS.freePass}
      aria-labelledby="free-pass-heading"
      className="bg-bg-secondary py-20"
    >
      <Container>
        <div className="grid grid-cols-1 gap-10 rounded-3xl border border-primary/30 bg-surface p-8 shadow-2xl lg:grid-cols-2 lg:p-12">
          <div>
            <h2
              id="free-pass-heading"
              className="font-display text-3xl font-bold text-text sm:text-4xl"
            >
              Tu primer entrenamiento va por nuestra cuenta
            </h2>
            <p className="mt-4 font-body text-text-muted">
              Vení a probar las instalaciones un día completo, sin cargo y sin
              dejar ninguna tarjeta.
            </p>
            <ul className="mt-8 space-y-4">
              {FREE_PASS_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <Check
                    className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="font-body text-sm text-text-muted">
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            <div>
              <label
                htmlFor="free-pass-name"
                className="font-body text-sm font-medium text-text"
              >
                Nombre y apellido
              </label>
              <input
                id="free-pass-name"
                value={values.name}
                onChange={(event) => setField('name', event.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name ? 'free-pass-name-error' : undefined
                }
                placeholder="Ana Ruiz"
                className={`mt-2 ${fieldClasses}`}
              />
              {errors.name && (
                <p
                  id="free-pass-name-error"
                  role="alert"
                  className="mt-1.5 font-body text-xs text-red-400"
                >
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="free-pass-phone"
                className="font-body text-sm font-medium text-text"
              >
                Tu WhatsApp
              </label>
              <input
                id="free-pass-phone"
                type="tel"
                inputMode="tel"
                value={values.phone}
                onChange={(event) => setField('phone', event.target.value)}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone ? 'free-pass-phone-error' : undefined
                }
                placeholder="341 272 4611"
                className={`mt-2 ${fieldClasses}`}
              />
              {errors.phone && (
                <p
                  id="free-pass-phone-error"
                  role="alert"
                  className="mt-1.5 font-body text-xs text-red-400"
                >
                  {errors.phone}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="free-pass-goal"
                className="font-body text-sm font-medium text-text"
              >
                ¿Cuál es tu objetivo?{' '}
                <span className="text-text-muted">(opcional)</span>
              </label>
              <select
                id="free-pass-goal"
                value={values.goal}
                onChange={(event) => setField('goal', event.target.value)}
                className={`mt-2 ${fieldClasses}`}
              >
                <option value="">Prefiero contarte por chat</option>
                {FREE_PASS_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body font-semibold text-background shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Reclamar mi pase por WhatsApp
            </button>
            <p className="text-center font-body text-xs text-text-muted">
              Se abre WhatsApp con el mensaje listo. No guardamos tus datos.
            </p>
          </form>
        </div>
      </Container>
    </section>
  );
};

export default LeadMagnetSection;
