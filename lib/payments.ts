/**
 * The payment instruments, defined once.
 *
 * Both the picker UI and the zod schema read from this list. They used to be
 * written independently — the UI sent 'gpay' while the schema only accepted
 * 'card' | 'upi' | 'netbanking' | 'wallet', so every donation from the UI was
 * rejected with a 400 while the API tests (which passed 'card') stayed green.
 * One list means that drift cannot happen again.
 */

export type PaymentKind = 'upi' | 'wallet' | 'card' | 'netbanking' | 'gateway'

export type PaymentMethod = {
  id: string
  name: string
  kind: PaymentKind
  /** Shown under the name in the picker, as real checkouts do. */
  hint?: string
  /** Domestic-only rails are hidden when paying in a non-INR currency. */
  international?: boolean
}

export const PAYMENT_METHODS = [
  // UPI is an India-only rail — it cannot settle a USD/EUR charge.
  { id: 'gpay', name: 'Google Pay', kind: 'upi', hint: 'UPI', international: false },
  { id: 'phonepe', name: 'PhonePe', kind: 'upi', hint: 'UPI', international: false },
  { id: 'paytm', name: 'Paytm', kind: 'upi', hint: 'UPI', international: false },
  { id: 'bhim', name: 'BHIM UPI', kind: 'upi', hint: 'UPI', international: false },
  { id: 'amazonpay', name: 'Amazon Pay', kind: 'wallet', hint: 'Wallet', international: false },
  { id: 'netbanking', name: 'Net Banking', kind: 'netbanking', hint: 'All major banks', international: false },
  // These settle cross-border.
  { id: 'paypal', name: 'PayPal', kind: 'wallet', hint: 'Pay in any currency', international: true },
  { id: 'card', name: 'Credit / Debit Card', kind: 'card', hint: 'Visa, Mastercard, RuPay, Amex', international: true },
  { id: 'razorpay', name: 'Razorpay', kind: 'gateway', hint: 'Cards, UPI, wallets', international: true },
] as const satisfies readonly PaymentMethod[]

/** Currencies the donation flow accepts. */
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', name: 'Euro' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as unknown as [CurrencyCode, ...CurrencyCode[]]

export const currency = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]

/** Methods usable for a given currency: non-INR hides the domestic-only rails. */
export const methodsFor = (code: string): readonly PaymentMethod[] =>
  code === 'INR' ? PAYMENT_METHODS : PAYMENT_METHODS.filter((m) => m.international)

export const formatMoney = (amount: number, code: string) => {
  const c = currency(code)
  return c.symbol + amount.toLocaleString(c.locale, { maximumFractionDigits: 2 })
}

/**
 * Indicative FX only, for converting a donation into the INR that fundraiser
 * goals and totals are denominated in.
 *
 * These are hardcoded and will drift from the real rate. A live integration
 * must take the rate from the payment provider at charge time and store the
 * settled amount — never from a constant in the client bundle.
 */
export const FX_TO_INR: Record<CurrencyCode, number> = {
  INR: 1,
  USD: 83.2,
  EUR: 90.1,
  GBP: 105.4,
}

export const toINR = (amount: number, code: string) =>
  Math.round(amount * (FX_TO_INR[code as CurrencyCode] ?? 1) * 100) / 100

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]['id']

/** Tuple form, because z.enum needs a non-empty literal tuple. */
export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((m) => m.id) as unknown as [
  PaymentMethodId,
  ...PaymentMethodId[],
]

export const methodName = (id: string): string =>
  PAYMENT_METHODS.find((m) => m.id === id)?.name ?? id

/** Banks offered in the net-banking flow. */
export const BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Yes Bank',
] as const
