'use client'

import { useState } from 'react'
import { Check, Link2 } from 'lucide-react'

/**
 * Share a group out to WhatsApp / Telegram.
 *
 * Deliberately uses each platform's public share URL rather than a bot or the
 * WhatsApp Business API: those need credentials, a public webhook and (for
 * WhatsApp) Meta approval. These links need nothing, work today, and hand the
 * message straight to whichever app the user already has open.
 *
 * The in-app group chat is unaffected — this invites people to it, it does not
 * replace it.
 */

const WhatsAppIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z" />
  </svg>
)

const TelegramIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M11.94 2.04a9.96 9.96 0 1 0 0 19.92 9.96 9.96 0 0 0 0-19.92zm4.64 6.82-1.55 7.32c-.12.52-.42.65-.86.4l-2.38-1.75-1.15 1.1c-.13.13-.24.24-.48.24l.17-2.43 4.42-3.99c.2-.17-.04-.27-.3-.1L8.98 12.1l-2.35-.73c-.51-.16-.52-.51.11-.76l9.18-3.54c.42-.16.79.1.66.79z" />
  </svg>
)

function shareText(name: string, issue: string, url: string) {
  return `Join "${name}" on EarthPulse — ${issue}\n\n${url}`
}

export function ShareButtons({ groupName, issue, groupId }: { groupName: string; issue: string; groupId: number }) {
  const [copied, setCopied] = useState(false)

  // Built at click time: window is not available during SSR.
  const url = () => `${window.location.origin}/?group=${groupId}`

  const openShare = (kind: 'whatsapp' | 'telegram') => {
    const text = shareText(groupName, issue, url())
    const href =
      kind === 'whatsapp'
        ? `https://wa.me/?text=${encodeURIComponent(text)}`
        : `https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(`Join "${groupName}" on EarthPulse — ${issue}`)}`
    // noopener: the opened tab must not get a handle on this window.
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard is blocked outside a secure context; failing silently is
      // better than throwing at the user, and the share buttons still work.
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => openShare('whatsapp')}
        aria-label={`Share ${groupName} on WhatsApp`}
        title="Share on WhatsApp"
        style={{ flex: 1, gap: 5 }}
      >
        <span style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon /></span>
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => openShare('telegram')}
        aria-label={`Share ${groupName} on Telegram`}
        title="Share on Telegram"
        style={{ flex: 1, gap: 5 }}
      >
        <span style={{ color: '#29A9EB', display: 'flex' }}><TelegramIcon /></span>
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={copy}
        aria-label={`Copy invite link for ${groupName}`}
        title="Copy invite link"
        style={{ flex: 1, gap: 5 }}
      >
        {copied ? <Check size={13} color="#30D158" /> : <Link2 size={13} />}
      </button>
    </div>
  )
}
