import styles from './Toggle.module.css';

interface ToggleProps {
  /** Whether the switch is on. */
  checked: boolean;
  /** Called with the NEXT value when the user flips the switch. */
  onChange: (checked: boolean) => void;
  /** Accessible name for the switch (rendered as its `aria-label`). */
  label: string;
  /** Disables interaction (e.g. while a save is in flight). */
  disabled?: boolean;
}

/**
 * An iOS-style on/off switch: a pill track with a sliding knob. Generic — the
 * caller owns what the switch means (this component holds no domain logic).
 * `role="switch"` + `aria-checked` make it a proper toggle for assistive tech.
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`${styles.track} ${checked ? styles.on : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
