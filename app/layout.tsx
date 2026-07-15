import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "EarthPulse — Smart Environment System",
  description: "Real-time environmental monitoring platform.",
}

// Matches --bg, so mobile browser chrome blends into the page.
export const viewport = {
  themeColor: "#08080B",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Inter only: it is the metric-compatible stand-in for SF Pro, which
            body{} prefers on Apple hardware. The old Plus Jakarta / Space
            Grotesk / JetBrains Mono trio was three families for one product. */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;450;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
