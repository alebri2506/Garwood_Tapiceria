import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Contenido a la izquierda dentro del campo (p. ej. "$" en un monto). */
  prefix?: ReactNode;
  /** Contenido a la derecha dentro del campo (p. ej. botón Mostrar). */
  suffix?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, required, prefix, suffix, id, className, ...input },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const msgId = `${fieldId}-msg`;
  const invalid = Boolean(error);

  return (
    <div className={['gw-field', invalid && 'is-invalid', className].filter(Boolean).join(' ')}>
      <label className="gw-field-label" htmlFor={fieldId}>
        {label}
        {required && <span className="gw-req" aria-hidden="true"> *</span>}
        {optional && <span className="gw-optional"> (opcional)</span>}
      </label>
      <div className="gw-input-wrap">
        {prefix && <span className="gw-input-prefix" aria-hidden="true">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          className="gw-input"
          aria-invalid={invalid}
          aria-required={required}
          aria-describedby={invalid || hint ? msgId : undefined}
          {...input}
        />
        {suffix && <span className="gw-input-suffix">{suffix}</span>}
      </div>
      {invalid ? (
        <p id={msgId} className="gw-field-error">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="gw-field-hint">{hint}</p>
      ) : null}
    </div>
  );
});
