import { siGooglepay, siPhonepe, siPaytm, siPaypal, siRazorpay, siVisa, siMastercard } from 'simple-icons'

/**
 * Payment brand marks.
 *
 * Replaces the emoji ("🟡", "💜", "🇮🇳") that stood in for logos — they render
 * differently on every OS and carry no brand recognition.
 *
 * Paths come from simple-icons (MIT), so the shapes are the real brand
 * geometry rather than something approximated by hand. Marks sit on a white
 * tile because the official brand colours (PayPal #002991, Paytm #20336B,
 * Razorpay #0C2451) are near-black and would vanish against this UI — which is
 * also how real checkouts present them.
 *
 * simple-icons has no Amazon Pay, BHIM/UPI or RuPay glyph, so those use a
 * text mark in the brand colour. A text mark is honest about being a stand-in;
 * a bad freehand path just looks broken.
 */

type P = { size?: number }

type Icon = { path: string; hex: string; title: string }

const TILE = (size: number): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: size * 0.28,
  background: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
})

function Brand({ icon, size = 34 }: { icon: Icon; size?: number }) {
  return (
    <span style={TILE(size)}>
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill={`#${icon.hex}`}
        role="img"
        aria-label={icon.title}
      >
        <path d={icon.path} />
      </svg>
    </span>
  )
}

/**
 * For brands simple-icons does not carry.
 *
 * aria-hidden because the glyph is decorative: the method's name sits next to
 * it in the picker, and without this the button's accessible name came out as
 * "UPI BHIM UPI" / "pay Amazon Pay".
 */
function TextMark({ label, color, size = 34, scale = 0.3 }: { label: string; color: string; size?: number; scale?: number }) {
  return (
    <span style={TILE(size)} aria-hidden="true">
      <span style={{ color, fontSize: size * scale, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {label}
      </span>
    </span>
  )
}

export const GooglePayIcon = ({ size }: P) => <Brand icon={siGooglepay} size={size} />
export const PhonePeIcon = ({ size }: P) => <Brand icon={siPhonepe} size={size} />
export const PaytmIcon = ({ size }: P) => <Brand icon={siPaytm} size={size} />
export const PayPalIcon = ({ size }: P) => <Brand icon={siPaypal} size={size} />
export const RazorpayIcon = ({ size }: P) => <Brand icon={siRazorpay} size={size} />

/** UPI's saffron/green, as a wordmark. */
export const BhimUpiIcon = ({ size = 34 }: P) => <TextMark label="UPI" color="#0F7A3D" size={size} scale={0.28} />
export const AmazonPayIcon = ({ size = 34 }: P) => <TextMark label="pay" color="#FF9900" size={size} scale={0.3} />

/** Cards show the networks they accept, as a checkout does. */
export function CardIcon({ size = 34 }: P) {
  return (
    <span style={{ ...TILE(size), gap: size * 0.06 }}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill={`#${siVisa.hex}`} role="img" aria-label="Visa">
        <path d={siVisa.path} />
      </svg>
      <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" fill={`#${siMastercard.hex}`} role="img" aria-label="Mastercard">
        <path d={siMastercard.path} />
      </svg>
    </span>
  )
}

export function NetBankingIcon({ size = 34 }: P) {
  return (
    <span style={TILE(size)} role="img" aria-label="Net Banking">
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#2E4A9E" strokeWidth="1.9" strokeLinecap="round">
        <path d="M3 9.5 12 4l9 5.5" />
        <path d="M5.5 10v7M9.5 10v7M14.5 10v7M18.5 10v7" />
        <path d="M3.5 20h17" />
      </svg>
    </span>
  )
}

const ICONS: Record<string, (p: P) => React.JSX.Element> = {
  gpay: GooglePayIcon,
  phonepe: PhonePeIcon,
  paytm: PaytmIcon,
  bhim: BhimUpiIcon,
  amazonpay: AmazonPayIcon,
  paypal: PayPalIcon,
  razorpay: RazorpayIcon,
  card: CardIcon,
  netbanking: NetBankingIcon,
}

export function PaymentIcon({ id, size = 34 }: { id: string; size?: number }) {
  const Icon = ICONS[id]
  return Icon ? <Icon size={size} /> : null
}
