import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/**
 * Form controls.
 *
 * Each field renders its label, hint and error together, and accepts the API's field-level
 * messages (`ApiError.fieldErrors`) so validation text comes from the same Zod schema that
 * guards the endpoint.
 */

interface BaseFieldProps {
  label: string;
  name: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

function FieldShell({
  label,
  name,
  hint,
  error,
  required,
  className = '',
  children,
}: BaseFieldProps & { children: ReactNode }) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={name}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : null}
      {!error && hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

type TextFieldProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'className'>;

export function TextField({ label, name, hint, error, required, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required} className={className}>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        className={`field-input ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectFieldProps = BaseFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'className'> & {
    options: { value: string; label: string; disabled?: boolean }[];
    placeholder?: string;
  };

export function SelectField({
  label,
  name,
  hint,
  error,
  required,
  className,
  options,
  placeholder,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required} className={className}>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        className={`field-input ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type TextAreaFieldProps = BaseFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'className'>;

export function TextAreaField({ label, name, hint, error, required, className, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} name={name} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={Boolean(error)}
        className={`field-input resize-y ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
        {...rest}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  error,
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-start gap-2.5 text-sm text-slate-700" htmlFor={name}>
        <input
          id={name}
          name={name}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          {...rest}
        />
        <span>
          <span className="font-medium">{label}</span>
          {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
        </span>
      </label>
      {error ? <p className="field-error ml-6">{error}</p> : null}
    </div>
  );
}
