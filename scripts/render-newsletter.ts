/**
 * Renders a sample Mayday Daily newsletter to ~/Desktop/mayday-daily-preview.html
 */
import { buildNewsletterHtml, fetchLatestSubstackPost, type NewsletterData } from '../lib/newsletterHtml'
import * as fs from 'fs'
import * as path from 'path'

async function main() {

const latestPost = await fetchLatestSubstackPost()

const sampleData: NewsletterData = {
  date: '2026-04-05',
  title: 'Walk-Offs, Blowouts, and Pitchers\' Duels — April 5 Recap',
  scores: [
    { away: 'NYY', home: 'TOR', awayScore: 6, homeScore: 0, winner: 'Gerrit Cole', loser: 'Kevin Gausman', save: null },
    { away: 'LAD', home: 'SD', awayScore: 5, homeScore: 7, winner: 'Robert Suarez', loser: 'Blake Treinen', save: null },
    { away: 'PHI', home: 'ATL', awayScore: 3, homeScore: 11, winner: 'Max Fried', loser: 'Zack Wheeler', save: null },
    { away: 'HOU', home: 'SEA', awayScore: 4, homeScore: 2, winner: 'Framber Valdez', loser: 'Luis Castillo', save: 'Josh Hader' },
    { away: 'CLE', home: 'MIN', awayScore: 3, homeScore: 1, winner: 'Tanner Bibee', loser: 'Pablo Lopez', save: 'Emmanuel Clase' },
    { away: 'SF', home: 'NYM', awayScore: 8, homeScore: 5, winner: 'Logan Webb', loser: 'Kodai Senga', save: null },
    { away: 'BAL', home: 'BOS', awayScore: 2, homeScore: 4, winner: 'Brayan Bello', loser: 'Grayson Rodriguez', save: 'Kenley Jansen' },
    { away: 'CHC', home: 'MIL', awayScore: 1, homeScore: 3, winner: 'Freddy Peralta', loser: 'Justin Steele', save: 'Devin Williams' },
    { away: 'TB', home: 'DET', awayScore: 6, homeScore: 7, winner: 'Jason Foley', loser: 'Pete Fairbanks', save: null },
    { away: 'TEX', home: 'LAA', awayScore: 5, homeScore: 3, winner: 'Nathan Eovaldi', loser: 'Tyler Anderson', save: 'Kirby Yates' },
    { away: 'STL', home: 'CIN', awayScore: 4, homeScore: 4, winner: null, loser: null, save: null },
    { away: 'KC', home: 'OAK', awayScore: 9, homeScore: 2, winner: 'Cole Ragans', loser: 'JP Sears', save: null },
    { away: 'WSH', home: 'MIA', awayScore: 3, homeScore: 1, winner: 'MacKenzie Gore', loser: 'Jesus Luzardo', save: 'Kyle Finnegan' },
    { away: 'PIT', home: 'ARI', awayScore: 2, homeScore: 6, winner: 'Zac Gallen', loser: 'Mitch Keller', save: null },
    { away: 'COL', home: 'CWS', awayScore: 7, homeScore: 1, winner: 'Kyle Freeland', loser: 'Garrett Crochet', save: null },
  ],
  dayRundown: `
    <p style="margin-bottom:14px;color:#d4d4d8;font-size:14px;line-height:1.7;">
      Saturday's slate delivered everything — from a dominant shutout in the Bronx to a walk-off thriller in San Diego. <strong style="color:#f0f0f0">Gerrit Cole</strong> turned in his best start of the young season, carving through the Blue Jays lineup for 7 scoreless innings with 11 strikeouts. The Yankees cruised to a 6-0 win behind a pair of <strong style="color:#f0f0f0">Aaron Judge</strong> homers, his third multi-HR game this week.
    </p>
    <p style="margin-bottom:14px;color:#d4d4d8;font-size:14px;line-height:1.7;">
      Out west, <strong style="color:#f0f0f0">Fernando Tatis Jr.</strong> launched a walk-off three-run shot in the bottom of the ninth to lift the Padres past the Dodgers, 7-5. The blast capped a furious rally from a 5-2 deficit and sent Petco Park into a frenzy. <strong style="color:#f0f0f0">Shohei Ohtani</strong> had gone 3-for-4 with a homer of his own in a losing effort.
    </p>
    <p style="margin-bottom:14px;color:#d4d4d8;font-size:14px;line-height:1.7;">
      In Atlanta, the Braves' bats stayed hot as <strong style="color:#f0f0f0">Ronald Acuña Jr.</strong> continued his torrid start with a 4-for-5 night including two doubles and a stolen base. The Braves routed the Phillies 11-3, their fifth straight win.
    </p>
  `,
  topPerformances: `
    <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Gerrit Cole</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">NYY</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          7.0 IP, 3 H, 0 ER, 11 K
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Aaron Judge</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">NYY</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          3-for-4, 2 HR, 4 RBI
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Fernando Tatis Jr.</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">SD</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          2-for-4, HR, 4 RBI (walk-off)
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Ronald Acuña Jr.</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">ATL</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          4-for-5, 2 2B, SB, 2 R
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Shohei Ohtani</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">LAD</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          3-for-4, HR, 2 RBI
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Zack Wheeler</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">PHI</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.55);font-size:12px;text-align:right">
          6.2 IP, 5 H, 2 ER, 9 K
        </td>
      </tr>
    </tbody></table>
  `,
  worstPerformances: '',
  injuries: `
    <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Max Fried</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">NYY</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#fbbf24;font-size:12px;text-align:right">
          Left after 3 IP with apparent forearm tightness
        </td>
      </tr>
    </tbody></table>
  `,
  transactions: `
    <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Chris Sale</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">ATL</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#34d399;font-size:12px;text-align:right">
          Activated from 15-day IL
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">
          <span style="font-weight:600;color:#f0f0f0">Tyler Glasnow</span>
          <span style="color:rgba(255,255,255,0.35);font-size:11px;margin-left:4px">LAD</span>
        </td>
        <td style="padding:6px 0 6px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#f87171;font-size:12px;text-align:right">
          Placed on 15-day IL (elbow inflammation)
        </td>
      </tr>
    </tbody></table>
  `,
  standouts: [
    {
      player_id: 543037,
      player_name: 'Gerrit Cole',
      team: 'NYY',
      plus_value: 142,
      plus_label: 'Stuff+',
      accent_color: '#fbbf24',
      role_label: 'Starter',
      subtitle: 'Four-Seam',
      game_line: { ip: '7.0', h: 3, er: 0, bb: 1, k: 11, decision: 'W' },
    },
    {
      player_id: 622663,
      player_name: 'Emmanuel Clase',
      team: 'CLE',
      plus_value: 156,
      plus_label: 'Stuff+',
      accent_color: '#fbbf24',
      role_label: 'Reliever',
      subtitle: 'Cutter',
      game_line: { ip: '1.0', h: 0, er: 0, bb: 0, k: 2, decision: 'SV' },
    },
    {
      player_id: 543037,
      player_name: 'Gerrit Cole',
      team: 'NYY',
      plus_value: 128,
      plus_label: 'Cmd+',
      accent_color: '#38bdf8',
      role_label: 'Starter',
      subtitle: '98 pitches',
      game_line: { ip: '7.0', h: 3, er: 0, bb: 1, k: 11, decision: 'W' },
    },
    {
      player_id: 669022,
      player_name: 'Josh Hader',
      team: 'HOU',
      plus_value: 119,
      plus_label: 'Cmd+',
      accent_color: '#38bdf8',
      role_label: 'Reliever',
      subtitle: '14 pitches',
      game_line: { ip: '1.0', h: 0, er: 0, bb: 0, k: 3, decision: 'SV' },
    },
  ],
  surges: [
    { player_id: 660271, player_name: 'Shohei Ohtani', metric_label: 'Exit Velo', sigma: 3.2, direction: 'up', sentiment: 'good', season_val: 89.4, recent_val: 95.1, delta: 5.7 },
    { player_id: 592450, player_name: 'Aaron Judge', metric_label: 'xwOBA', sigma: 2.8, direction: 'up', sentiment: 'good', season_val: .385, recent_val: .482, delta: .097 },
    { player_id: 666182, player_name: 'Bobby Witt Jr.', metric_label: 'K%', sigma: 2.5, direction: 'down', sentiment: 'good', season_val: 18.2, recent_val: 12.1, delta: -6.1 },
    { player_id: 608369, player_name: 'Paul Skenes', metric_label: 'Whiff%', sigma: 2.3, direction: 'up', sentiment: 'good', season_val: 31.5, recent_val: 38.2, delta: 6.7 },
    { player_id: 543037, player_name: 'Gerrit Cole', metric_label: 'Velo', sigma: 2.1, direction: 'up', sentiment: 'good', season_val: 96.8, recent_val: 98.4, delta: 1.6 },
  ],
  concerns: [
    { player_id: 571945, player_name: 'Max Scherzer', metric_label: 'Velo', sigma: -3.1, direction: 'down', sentiment: 'bad', season_val: 93.2, recent_val: 90.1, delta: -3.1 },
    { player_id: 605141, player_name: 'Mookie Betts', metric_label: 'Hard Hit%', sigma: -2.7, direction: 'down', sentiment: 'bad', season_val: 42.5, recent_val: 31.2, delta: -11.3 },
    { player_id: 665489, player_name: 'Adley Rutschman', metric_label: 'xwOBA', sigma: -2.4, direction: 'down', sentiment: 'bad', season_val: .358, recent_val: .278, delta: -.080 },
    { player_id: 641355, player_name: 'Shane Bieber', metric_label: 'Zone%', sigma: -2.2, direction: 'down', sentiment: 'bad', season_val: 48.1, recent_val: 39.5, delta: -8.6 },
    { player_id: 518516, player_name: 'Freddie Freeman', metric_label: 'BB%', sigma: -2.0, direction: 'down', sentiment: 'bad', season_val: 11.2, recent_val: 5.8, delta: -5.4 },
  ],
  latestPost,
  unsubscribeUrl: 'https://www.tritonapex.io/api/newsletter/unsubscribe?token=preview-token',
}

const html = buildNewsletterHtml(sampleData)
const outPath = path.join(process.env.HOME || '/Users/trevor', 'Desktop', 'mayday-daily-preview.html')
fs.writeFileSync(outPath, html, 'utf-8')
console.log(`Rendered to ${outPath}`)
console.log(`Latest post: ${latestPost?.title || 'none found'}`)
}

main()
