"use client";

import { useEffect, useState, type InputHTMLAttributes } from 'react';

function formatForDisplay(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return '';
  }

  return String(value);
}

export function parseDecimalInput(value: string): number {
  const normalized = value.replace(',', '.').trim();
  if (normalized === '' || normalized === '.' || normalized === '-') {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed < 0 ? 0 : parsed;
}

const PARTIAL_DECIMAL = /^\d*[,.]?\d*$/;

interface DecimalInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
}

export function DecimalInput({ value, onValueChange, className, onFocus, onBlur, ...rest }: DecimalInputProps) {
  const [text, setText] = useState(() => formatForDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatForDisplay(value));
    }
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? text : formatForDisplay(value)}
      onFocus={(event) => {
        setFocused(true);
        setText(formatForDisplay(value));
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (next !== '' && !PARTIAL_DECIMAL.test(next)) {
          return;
        }

        setText(next);

        if (next !== '' && next !== '.' && next !== ',') {
          onValueChange(parseDecimalInput(next));
        }
      }}
      onBlur={(event) => {
        const parsed = parseDecimalInput(text);
        setFocused(false);
        onValueChange(parsed);
        setText(formatForDisplay(parsed));
        onBlur?.(event);
      }}
      className={className}
      {...rest}
    />
  );
}
