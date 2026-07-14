import { parseKcInput } from '../../engine/money';
import styles from './forms.module.css';

interface MoneyInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Small grey note under the label (e.g. the "computed" mortgage hint). */
  hint?: string;
  /** Blank input is allowed (treated as "no value"). Default false. */
  allowEmpty?: boolean;
}

/** True if `raw` parses to halere, honouring the allowEmpty rule. */
export function isMoneyValid(raw: string, allowEmpty = false): boolean {
  if (raw.trim() === '') {
    return allowEmpty;
  }
  return parseKcInput(raw) !== null;
}

/** A crown-amount text field with inline parse validation (Czech formatting). */
export function MoneyInput({ id, label, value, onChange, hint, allowEmpty }: MoneyInputProps) {
  const invalid = !isMoneyValid(value, allowEmpty);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint && <span className={styles.hint}>{hint}</span>}
      <div className={styles.moneyWrap}>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          placeholder="0"
        />
        <span className={styles.suffix} aria-hidden="true">
          Kč
        </span>
      </div>
      {invalid && (
        <span className={styles.error} role="alert">
          Enter an amount like 1 234 567 or 1234,50
        </span>
      )}
    </div>
  );
}
