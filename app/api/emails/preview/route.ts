import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { renderEmail } from '@/lib/emails/renderBlock'
import { resolveAllBindings } from '@/lib/emails/resolveBindings'
import type { EmailTemplate, EmailProduct, ProductBranding, TemplateSettings } from '@/lib/emailTypes'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { template_id, sample_data } = body

    if (!template_id) {
      return NextResponse.json({ error: 'Missing required field: template_id' }, { status: 400 })
    }

    // Fetch template with product branding
    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .select('*, email_products:product_id(id, name, slug, branding)')
      .eq('id', template_id)
      .single()

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const tmpl = template as unknown as EmailTemplate & { email_products: EmailProduct }
    const product = tmpl.email_products
    const branding = (product?.branding || { primaryColor: '#34d399', headerStyle: 'banner', fromName: 'Preview', fromEmail: 'noreply@tritonapex.io' }) as ProductBranding
    const settings = (tmpl.settings || { maxWidth: 640, bodyBg: '#09090b', contentBg: '#09090b', fontFamily: 'sans-serif' }) as TemplateSettings

    // Compute date for data binding resolution
    const now = new Date()
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    et.setDate(et.getDate() - 1)
    const previewDate = et.toISOString().slice(0, 10)

    // Resolve data bindings (use sample_data overrides if provided, otherwise fetch live)
    let bindingData: Record<string, Record<string, unknown>>
    if (sample_data && typeof sample_data === 'object') {
      bindingData = sample_data
    } else {
      bindingData = await resolveAllBindings(tmpl.blocks, previewDate)
    }

    // Build subject
    const dateShort = new Date(previewDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const subject = tmpl.subject_template
      .replace(/\{\{title\}\}/g, product?.name || 'Preview')
      .replace(/\{\{date_short\}\}/g, dateShort)
      .replace(/\{\{date\}\}/g, previewDate)

    // Render full email HTML
    const html = renderEmail({
      blocks: tmpl.blocks,
      branding,
      settings,
      data: bindingData,
      subject,
      date: previewDate,
      unsubscribeUrl: '#unsubscribe-preview',
    })

    return NextResponse.json({
      html,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        version: tmpl.version,
        subject_template: tmpl.subject_template,
        preheader_template: tmpl.preheader_template,
        blocks: tmpl.blocks,
        settings,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
