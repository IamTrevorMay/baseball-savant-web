export const metadata = {
  title: 'Mayday Daily',
  description: 'Your morning baseball newsletter — scores, standouts, and trends delivered daily.',
}

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased flex items-center justify-center">
      {children}
    </div>
  )
}
