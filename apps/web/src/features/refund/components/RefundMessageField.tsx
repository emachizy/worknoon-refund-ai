import { forwardRef } from 'react';

export const MESSAGE_MIN_LENGTH = 5;
export const MESSAGE_MAX_LENGTH = 2000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
}

export const RefundMessageField = forwardRef<HTMLTextAreaElement, Props>(function RefundMessageField(
  { value, onChange, disabled, error },
  ref
) {
  const describedBy = ['message-hint', 'message-count', error ? 'message-error' : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor="message" className="field-label">
        Tell us what happened
      </label>
      <p id="message-hint" className="field-hint">
        Describe the issue with your order and why you're requesting a refund.
      </p>
      <textarea
        id="message"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MESSAGE_MAX_LENGTH}
        rows={5}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      <div className="field-footer">
        {error ? (
          <p id="message-error" className="field-error">
            {error}
          </p>
        ) : (
          <span />
        )}
        <span id="message-count" className="char-count">
          {value.length} / {MESSAGE_MAX_LENGTH}
        </span>
      </div>
    </div>
  );
});
