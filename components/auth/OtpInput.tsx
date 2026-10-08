"use client";

import React, { useRef, useEffect } from "react";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}

export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = true,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const hasTriggeredCompleteRef = useRef<string | null>(null);

  // Normalize value to at most 6 digits
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  // Autofocus first input on mount if enabled
  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  // When value reaches 6 digits, auto-submit if not already triggered for this exact code
  useEffect(() => {
    if (value.length === 6 && onComplete && hasTriggeredCompleteRef.current !== value) {
      hasTriggeredCompleteRef.current = value;
      onComplete(value);
    } else if (value.length < 6) {
      hasTriggeredCompleteRef.current = null;
    }
  }, [value, onComplete]);

  const handleInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const inputVal = e.target.value;

    // Extract only digits
    const cleanVal = inputVal.replace(/\D/g, "");

    if (!cleanVal) {
      // Empty / cleared
      const newDigits = [...digits];
      newDigits[index] = "";
      const newCode = newDigits.join("").trimEnd();
      onChange(newCode);
      return;
    }

    if (cleanVal.length > 1) {
      // Pasted or typed multiple digits directly in one input
      handlePasteString(cleanVal);
      return;
    }

    // Single digit entered
    const char = cleanVal[cleanVal.length - 1];
    const newDigits = [...digits];
    newDigits[index] = char;
    const newCode = newDigits.join("");
    onChange(newCode);

    // Focus next box if available
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePasteString = (pastedText: string) => {
    const numericOnly = pastedText.replace(/\D/g, "").slice(0, 6);
    if (!numericOnly) return;

    onChange(numericOnly);

    // Focus appropriate input or blur if full 6
    if (numericOnly.length === 6) {
      inputRefs.current[5]?.focus();
    } else {
      inputRefs.current[numericOnly.length]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    const pastedText = e.clipboardData.getData("text");
    handlePasteString(pastedText);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current slot is empty, backspace moves to previous and clears it
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index - 1] = "";
        const newCode = newDigits.join("").trimEnd();
        onChange(newCode);
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        // Clear current slot
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[index] = "";
        const newCode = newDigits.join("").trimEnd();
        onChange(newCode);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex justify-between items-center gap-2 sm:gap-3 w-full">
      {digits.map((digit, index) => {
        const isFilled = Boolean(digit);
        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete="one-time-code"
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInputChange(index, e)}
            onPaste={handlePaste}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-mono font-bold rounded-xl transition-all outline-none border ${
              disabled
                ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                : hasError
                ? "bg-rose-500/10 border-rose-500 text-rose-300 ring-2 ring-rose-500/30 focus:border-rose-400 focus:ring-rose-500/40"
                : isFilled
                ? "bg-slate-900/90 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-500/30"
                : "bg-slate-900/80 border-slate-700/80 text-white placeholder-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
            }`}
          />
        );
      })}
    </div>
  );
}
