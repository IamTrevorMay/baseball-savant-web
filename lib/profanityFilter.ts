const BANNED_WORDS = [
  // Profanity
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick', 'cock', 'pussy',
  'whore', 'slut', 'bastard', 'piss', 'tits', 'twat', 'wank', 'stfu', 'gtfo',
  // Racial/ethnic slurs
  'nigger', 'nigga', 'chink', 'spic', 'kike', 'wetback', 'gook', 'wop',
  'beaner', 'cracker', 'gringo', 'jap', 'raghead', 'towelhead', 'redskin', 'coon',
  // Homophobic/transphobic slurs
  'fag', 'faggot', 'dyke', 'tranny',
  // Ableist slurs
  'retard', 'retarded',
  // Other
  'nazi', 'hitler',
]

export function containsProfanity(name: string): boolean {
  const lower = name.toLowerCase().replace(/[^a-z]/g, '')
  return BANNED_WORDS.some(word => lower.includes(word))
}
