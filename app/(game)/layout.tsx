import { Press_Start_2P } from 'next/font/google'

const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel' })

export const metadata = {
  title: 'Percentile — A Mayday Game',
  description: 'Daily MLB percentile guessing game',
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${pixel.variable} antialiased fixed inset-0 overflow-y-auto`}
      style={{ background: '#0C0C0C', color: '#FCFCFC', fontFamily: 'var(--font-pixel), monospace' }}
    >
      {children}
      {/* CRT scanline overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50"
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px)',
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  )
}
