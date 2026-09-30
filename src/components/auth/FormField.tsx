import { cloneElement, type ReactElement } from "react";

type InputProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type FormFieldProps = {
  id: string;
  label: string;
  error?: string;
  children: ReactElement<InputProps>;
};

// The label's htmlFor and the input's id are the same value, so a screen reader (or a click on
// the label) always resolves to this exact input. aria-describedby only points at the error
// text when there is one, so it isn't announced as "described by" an element that doesn't exist.
export function FormField({ id, label, error, children }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-900">
        {label}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
