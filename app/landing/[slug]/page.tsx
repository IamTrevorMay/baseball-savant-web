import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { EmailProduct, ProductBranding, LandingConfig, EmailSend } from '@/lib/emailTypes'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  // Fetch product by slug
  const { data: product } = await supabase
    .from('email_products')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('landing_enabled', true)
    .single()

  if (!product) notFound()

  const p = product as unknown as EmailProduct
  const branding = p.branding as ProductBranding
  const landing = p.landing_config as LandingConfig
  const primary = branding.primaryColor || '#34d399'

  // Fetch recent sends for archive
  const { data: recentSends } = await supabase
    .from('email_sends')
    .select('id, subject, date, sent_at')
    .eq('product_id', p.id)
    .eq('status', 'sent')
    .eq('send_type', 'recurring')
    .order('sent_at', { ascending: false })
    .limit(5)

  const sends = (recentSends || []) as unknown as Pick<EmailSend, 'id' | 'subject' | 'date' | 'sent_at'>[]

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{p.name} — Subscribe</title>
        <meta name="description" content={landing.description || `Subscribe to ${p.name}`} />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#09090b', color: '#d4d4d8', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          {/* Logo / Header */}
          {branding.logoUrl && (
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <img
                src={branding.logoUrl}
                alt={p.name}
                style={{ maxWidth: 240, height: 'auto' }}
              />
            </div>
          )}

          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#f0f0f0', letterSpacing: '-0.02em' }}>
              {landing.heroText || p.name}
            </h1>
            {landing.description && (
              <p style={{ margin: '12px 0 0', fontSize: 15, color: '#71717a', lineHeight: 1.6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                {landing.description}
              </p>
            )}
          </div>

          {/* Subscribe form */}
          <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 24, marginBottom: 40 }}>
            <form action={`/api/emails/subscribe`} method="POST" id="subscribe-form">
              <input type="hidden" name="product_slug" value={slug} />
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  name="name"
                  placeholder="Your name (optional)"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 14,
                    background: '#09090b', border: '1px solid #3f3f46', borderRadius: 8,
                    color: '#f0f0f0', outline: 'none',
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <input
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: 14,
                    background: '#09090b', border: '1px solid #3f3f46', borderRadius: 8,
                    color: '#f0f0f0', outline: 'none',
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  width: '100%', padding: '12px 24px', fontSize: 14, fontWeight: 600,
                  background: primary, color: '#09090b', border: 'none', borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Subscribe
              </button>
            </form>

            {/* Client-side form submission */}
            <script dangerouslySetInnerHTML={{ __html: `
              document.getElementById('subscribe-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                var form = e.target;
                var btn = form.querySelector('button[type="submit"]');
                var origText = btn.textContent;
                btn.textContent = 'Subscribing...';
                btn.disabled = true;
                try {
                  var res = await fetch('/api/emails/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: form.email.value,
                      name: form.name.value || undefined,
                      product_slug: '${slug}',
                    }),
                  });
                  if (res.ok) {
                    btn.textContent = 'Subscribed!';
                    btn.style.background = '#22c55e';
                    form.email.value = '';
                    form.name.value = '';
                  } else {
                    var data = await res.json();
                    btn.textContent = data.error || 'Error — try again';
                    btn.style.background = '#ef4444';
                  }
                } catch (err) {
                  btn.textContent = 'Error — try again';
                  btn.style.background = '#ef4444';
                }
                setTimeout(function() {
                  btn.textContent = origText;
                  btn.style.background = '${primary}';
                  btn.disabled = false;
                }, 3000);
              });
            `}} />
          </div>

          {/* Recent issues */}
          {sends.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#71717a' }}>
                Recent Issues
              </h2>
              {sends.map((s) => {
                const d = s.sent_at ? new Date(s.sent_at) : s.date ? new Date(s.date + 'T12:00:00Z') : null
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: '12px 16px', background: '#18181b', border: '1px solid #27272a',
                      borderRadius: 8, marginBottom: 8,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f0f0f0' }}>
                      {s.subject}
                    </p>
                    {d && (
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#71717a' }}>
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Social links */}
          {landing.socialLinks && landing.socialLinks.length > 0 && (
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              {landing.socialLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block', margin: '0 8px', fontSize: 12,
                    fontWeight: 600, color: '#71717a', textDecoration: 'none',
                  }}
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', borderTop: '1px solid #27272a', paddingTop: 24 }}>
            <p style={{ margin: 0, fontSize: 11, color: '#52525b' }}>
              Powered by <a href="https://www.tritonapex.io" style={{ color: primary, textDecoration: 'none' }}>Triton Apex</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
