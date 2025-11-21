/**
 * Currency Constants
 *
 * Database stores amounts in cents (分)
 * UI displays amounts in yuan (C)
 * 1 yuan = 100 cents
 */

/** Currency conversion ratio: 1 yuan = 100 cents */
export const CURRENCY_UNIT = 100

/**
 * Convert cents (分) to yuan (元)
 *
 * @param cents - Amount in cents (database value)
 * @returns Amount in yuan
 *
 * @example
 * fenToYuan(10000) // 100.00
 * fenToYuan(150) // 1.50
 * fenToYuan(1) // 0.01
 */
export function fenToYuan(cents: number): number {
  return cents / CURRENCY_UNIT
}

/**
 * Convert yuan (元) to cents (分)
 *
 * @param yuan - Amount in yuan (user input)
 * @returns Amount in cents (database value)
 *
 * @example
 * yuanToFen(100) // 10000
 * yuanToFen(1.5) // 150
 * yuanToFen(0.01) // 1
 */
export function yuanToFen(yuan: number): number {
  return Math.round(yuan * CURRENCY_UNIT)
}

/**
 * Format cents to yuan string with currency symbol
 *
 * @param cents - Amount in cents
 * @param options - Formatting options
 * @returns Formatted string (e.g., "¥ 100.00")
 *
 * @example
 * formatCurrency(10000) // "¥ 100.00"
 * formatCurrency(150, { symbol: false }) // "1.50"
 * formatCurrency(1, { decimals: 2 }) // "¥ 0.01"
 */
export function formatCurrency(
  cents: number,
  options?: {
    symbol?: boolean
    decimals?: number
  }
): string {
  const { symbol = true, decimals = 2 } = options || {}
  const yuan = fenToYuan(cents)
  const formatted = yuan.toFixed(decimals)
  return symbol ? `¥ ${formatted}` : formatted
}
