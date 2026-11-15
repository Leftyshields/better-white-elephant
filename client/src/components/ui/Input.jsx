/**
 * Input Component
 * Isolated component ready for Tailwind UI premium code
 */
import { useId } from 'react';

const inputFocusClasses =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:border-purple-500';

export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  required = false,
  className = '',
  id: idProp,
  ...props
}) {
  const autoId = useId();
  const inputId = idProp ?? (label ? autoId : undefined);

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-300 mb-1">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`w-full min-h-11 px-3 py-2 bg-slate-950/50 border border-slate-700 rounded-md shadow-sm text-white placeholder:text-slate-400 ${inputFocusClasses} ${
          error ? 'border-red-500' : ''
        } ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}


