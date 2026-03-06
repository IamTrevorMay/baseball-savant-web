import { NextRequest, NextResponse } from 'next/server'

export interface PlayerMeta {
  id: number
  name: string
  number: string
  position: string
  birthCountry: string
  age: number
}

const cache = new Map<number, PlayerMeta>()

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get('id') || '0')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const cached = cache.get(id)
  if (cached) return NextResponse.json(cached)

  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`, {
      next: { revalidate: 86400 },
    })
    const data = await res.json()
    const person = data.people?.[0]
    if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const birthDate = person.birthDate ? new Date(person.birthDate) : null
    const age = birthDate
      ? Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 86400_000))
      : 0

    const meta: PlayerMeta = {
      id: person.id,
      name: person.lastFirstName || person.fullName || '?',
      number: person.primaryNumber || '?',
      position: person.primaryPosition?.abbreviation || '?',
      birthCountry: person.birthCountry || '?',
      age,
    }

    cache.set(id, meta)
    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
