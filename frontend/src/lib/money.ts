export const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'CRC', 'COP', 'PYG', 'JPY', 'KRW', 'IDR', 'VND'])

export function amountStepFor(currency: string): string {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? '1' : '0.01'
}

export function parseAmountInput(value: string, step: string): string {
  const v = value.trim().replace(/[^\d.,]/g, '')
  if (!v) return ''
  const hasDot = v.includes('.')
  const hasComma = v.includes(',')
  let n = v
  if (hasDot && hasComma) {
    const li = v.lastIndexOf('.'), lc = v.lastIndexOf(',')
    n = lc > li ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '')
  } else if (hasComma) {
    n = /^(\d{1,3})(,\d{3})*$/.test(v) ? v.replace(/,/g, '') : v.replace(',', '.')
  } else if (hasDot) {
    if (step === '1' || /^(\d{1,3})(\.\d{3})+$/.test(v)) n = v.replace(/\./g, '')
  }
  const num = parseFloat(n)
  if (!Number.isFinite(num)) return ''
  return step === '1' ? String(Math.round(num)) : String(num)
}

export function fmtAmountInput(value: string, step: string): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (!Number.isFinite(num)) return value
  const dec = step === '1' ? 0 : 2
  return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
