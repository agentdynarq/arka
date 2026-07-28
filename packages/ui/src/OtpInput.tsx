'use client'

import { useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'

export interface OtpInputProps {
  readonly length?: number
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoFocus?: boolean
}

/**
 * A row of single-digit boxes for a 6-digit code, matching screen W3's step-up
 * confirmation and reused everywhere else this codebase asks for a TOTP or
 * OTP code (W1's MFA step, W4's agent-cash OTP): one component instead of
 * three copies of the same digit-by-digit typing logic.
 */
export function OtpInput({ length = 6, value, onChange, autoFocus }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  function setDigit(index: number, digit: string) {
    const digits = value.padEnd(length, ' ').split('')
    digits[index] = digit
    const next = digits.join('').replace(/ +$/, '')
    onChange(next)
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    if (!digit) return
    setDigit(index, digit)
    if (index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    event.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="ui-otp-input" onPaste={handlePaste}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el
          }}
          className="ui-otp-input__box"
          inputMode="numeric"
          maxLength={1}
          value={value[index] ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          autoFocus={autoFocus && index === 0}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  )
}
