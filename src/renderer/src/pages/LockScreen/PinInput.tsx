import { useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react'

const PIN_LENGTH = 4

interface PinInputProps {
  onComplete: (pin: string) => void
  disabled?: boolean
}

export interface PinInputRef {
  clear: () => void
  shake: () => void
  focus: () => void
}

const PinInput = forwardRef<PinInputRef, PinInputProps>(function PinInput(
  { onComplete, disabled = false },
  ref
) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [values, setValues] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [shaking, setShaking] = useState(false)

  useImperativeHandle(ref, () => ({
    clear: (): void => {
      setValues(Array(PIN_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    },
    shake: (): void => {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    },
    focus: (): void => {
      inputRefs.current[0]?.focus()
    }
  }))

  const handleChange = useCallback(
    (index: number, value: string) => {
      if (disabled) return

      const digit = value.replace(/\D/g, '').slice(-1)
      const newValues = [...values]
      newValues[index] = digit
      setValues(newValues)

      if (digit && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus()
      }

      if (digit && index === PIN_LENGTH - 1) {
        const pin = newValues.join('')
        if (pin.length === PIN_LENGTH) {
          onComplete(pin)
        }
      }
    },
    [values, onComplete, disabled]
  )

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return

      if (e.key === 'Backspace') {
        if (!values[index] && index > 0) {
          const newValues = [...values]
          newValues[index - 1] = ''
          setValues(newValues)
          inputRefs.current[index - 1]?.focus()
        } else {
          const newValues = [...values]
          newValues[index] = ''
          setValues(newValues)
        }
        e.preventDefault()
      }
    },
    [values, disabled]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return

      e.preventDefault()
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
      if (!pasted) return

      const newValues = Array(PIN_LENGTH).fill('')
      for (let i = 0; i < pasted.length; i++) {
        newValues[i] = pasted[i]
      }
      setValues(newValues)

      if (pasted.length === PIN_LENGTH) {
        onComplete(pasted)
      } else {
        inputRefs.current[pasted.length]?.focus()
      }
    },
    [onComplete, disabled]
  )

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        animation: shaking ? 'pin-shake 0.5s ease-in-out' : undefined
      }}
    >
      <style>
        {`
          @keyframes pin-shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
            20%, 40%, 60%, 80% { transform: translateX(6px); }
          }
        `}
      </style>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el): void => {
            inputRefs.current[i] = el
          }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={values[i]}
          disabled={disabled}
          onChange={(e): void => handleChange(i, e.target.value)}
          onKeyDown={(e): void => handleKeyDown(i, e)}
          onPaste={handlePaste}
          autoFocus={i === 0}
          style={{
            width: 56,
            height: 56,
            fontSize: 24,
            textAlign: 'center',
            border: '2px solid #d9d9d9',
            borderRadius: 8,
            outline: 'none',
            transition: 'border-color 0.2s',
            WebkitTextSecurity: 'disc'
          }}
          onFocus={(e): void => {
            e.target.style.borderColor = '#1677ff'
          }}
          onBlur={(e): void => {
            e.target.style.borderColor = '#d9d9d9'
          }}
        />
      ))}
    </div>
  )
})

export default PinInput
