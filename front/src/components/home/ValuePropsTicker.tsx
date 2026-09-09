import { VALUE_PROPS } from './landing.data';

// The list is rendered twice inside a double-width track and the animation
// translates by exactly -50%: when it lands, the second copy sits where the
// first started, so the loop has no visible seam. The duplicate is
// aria-hidden so a screen reader hears the benefits once.
const ValuePropsTicker = () => (
  <section
    aria-label="Beneficios de entrenar en FLG"
    className="overflow-hidden border-b border-border bg-surface py-3"
  >
    <div className="flex w-max animate-marquee">
      {[0, 1].map((copy) => (
        <ul
          key={copy}
          className="flex shrink-0 items-center gap-10 pr-10"
          aria-hidden={copy === 1}
        >
          {VALUE_PROPS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex shrink-0 items-center gap-2 font-body text-xs text-text-muted"
            >
              <Icon
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {label}
            </li>
          ))}
        </ul>
      ))}
    </div>
  </section>
);

export default ValuePropsTicker;
