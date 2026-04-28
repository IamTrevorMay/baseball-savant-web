import { renderCardToPNG } from '../lib/serverRenderCard';
import { writeFileSync, mkdirSync } from 'fs';

// Fixed center X for each column — headers & values share the same center
const LEFT_COL = 310;
const RIGHT_COL = 720;
const CC = 540; // canvas center

// helper: given center X and width, return x for align:center boxes
const cx = (center: number, w: number) => center - w / 2;

// row geometry
const ROW_H = 105;
const ROW_GAP = 10;
const ROW_START = 242;
const rowY = (i: number) => ROW_START + i * (ROW_H + ROW_GAP);
const labelY = (i: number) => rowY(i) + 38;
const valY = (i: number) => rowY(i) + 28;

const scene = {
  id: 'walker-splits',
  name: 'Jordan Walker',
  width: 1080,
  height: 1080,
  background: '#0a0a0a',
  elements: [
    // top accent bar
    { type: 'rect', x: 0, y: 0, width: 1080, height: 6, id: 'bar', zIndex: 0, props: {}, color: '#10b981' },

    // header
    { type: 'player-image', x: 40, y: 22, width: 120, height: 120, id: 'hs', zIndex: 1, props: { playerId: 691023, circle: true } },
    { type: 'text', x: 180, y: 40, width: 600, height: 60, id: 'nm', zIndex: 1, props: { text: 'JORDAN WALKER', fontSize: 59, fontWeight: 'bold', color: '#ffffff' } },
    { type: 'text', x: 180, y: 100, width: 600, height: 35, id: 'sub', zIndex: 1, props: { text: 'STL  |  RF  |  Batting Splits', fontSize: 31, color: '#a1a1aa' } },
    { type: 'rect', x: 40, y: 155, width: 1000, height: 2, id: 'd1', zIndex: 0, props: {}, color: '#27272a' },

    // column header pills — centered over their value columns
    { type: 'rect', x: 40, y: 172, width: 480, height: 55, id: 'h1', zIndex: 0, props: { borderRadius: 8 }, color: '#18181b' },
    { type: 'text', x: cx(LEFT_COL, 280), y: 185, width: 280, height: 40, id: 'h1t', zIndex: 1, props: { text: '2023\u20132025', fontSize: 36, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'rect', x: 560, y: 172, width: 480, height: 55, id: 'h2', zIndex: 0, props: { borderRadius: 8 }, color: '#064e3b' },
    { type: 'text', x: cx(RIGHT_COL, 280), y: 185, width: 280, height: 40, id: 'h2t', zIndex: 1, props: { text: '2026 thru 4/20', fontSize: 30, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },

    // Row 0: AVG
    { type: 'rect', x: 40, y: rowY(0), width: 1000, height: ROW_H, id: 'r1', zIndex: 0, props: { borderRadius: 12 }, color: '#18181b' },
    { type: 'text', x: 65, y: labelY(0), width: 120, height: 40, id: 'l1', zIndex: 1, props: { text: 'AVG', fontSize: 31, fontWeight: 'bold', color: '#71717a' } },
    { type: 'text', x: cx(LEFT_COL, 240), y: valY(0), width: 240, height: 60, id: 'v1a', zIndex: 1, props: { text: '.240', fontSize: 62, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'text', x: cx(RIGHT_COL, 240), y: valY(0), width: 240, height: 60, id: 'v1b', zIndex: 1, props: { text: '.271', fontSize: 62, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },
    { type: 'text', x: 880, y: labelY(0), width: 140, height: 30, id: 'd1v', zIndex: 1, props: { text: '+31 pts', fontSize: 25, color: '#10b981' } },

    // Row 1: OBP
    { type: 'rect', x: 40, y: rowY(1), width: 1000, height: ROW_H, id: 'r2', zIndex: 0, props: { borderRadius: 12 }, color: '#18181b' },
    { type: 'text', x: 65, y: labelY(1), width: 120, height: 40, id: 'l2', zIndex: 1, props: { text: 'OBP', fontSize: 31, fontWeight: 'bold', color: '#71717a' } },
    { type: 'text', x: cx(LEFT_COL, 240), y: valY(1), width: 240, height: 60, id: 'v2a', zIndex: 1, props: { text: '.301', fontSize: 62, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'text', x: cx(RIGHT_COL, 240), y: valY(1), width: 240, height: 60, id: 'v2b', zIndex: 1, props: { text: '.333', fontSize: 62, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },
    { type: 'text', x: 880, y: labelY(1), width: 140, height: 30, id: 'd2v', zIndex: 1, props: { text: '+32 pts', fontSize: 25, color: '#10b981' } },

    // Row 2: SLG
    { type: 'rect', x: 40, y: rowY(2), width: 1000, height: ROW_H, id: 'r3', zIndex: 0, props: { borderRadius: 12 }, color: '#18181b' },
    { type: 'text', x: 65, y: labelY(2), width: 120, height: 40, id: 'l3', zIndex: 1, props: { text: 'SLG', fontSize: 31, fontWeight: 'bold', color: '#71717a' } },
    { type: 'text', x: cx(LEFT_COL, 240), y: valY(2), width: 240, height: 60, id: 'v3a', zIndex: 1, props: { text: '.380', fontSize: 62, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'text', x: cx(RIGHT_COL, 240), y: valY(2), width: 240, height: 60, id: 'v3b', zIndex: 1, props: { text: '.512', fontSize: 62, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },
    { type: 'text', x: 880, y: labelY(2), width: 140, height: 30, id: 'd3v', zIndex: 1, props: { text: '+132 pts', fontSize: 25, color: '#10b981' } },

    // Row 3: K%
    { type: 'rect', x: 40, y: rowY(3), width: 1000, height: ROW_H, id: 'r4', zIndex: 0, props: { borderRadius: 12 }, color: '#18181b' },
    { type: 'text', x: 65, y: labelY(3), width: 120, height: 40, id: 'l4', zIndex: 1, props: { text: 'K%', fontSize: 31, fontWeight: 'bold', color: '#71717a' } },
    { type: 'text', x: cx(LEFT_COL, 240), y: valY(3), width: 240, height: 60, id: 'v4a', zIndex: 1, props: { text: '26.7%', fontSize: 62, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'text', x: cx(RIGHT_COL, 240), y: valY(3), width: 240, height: 60, id: 'v4b', zIndex: 1, props: { text: '31.9%', fontSize: 62, fontWeight: 'bold', color: '#ef4444', textAlign: 'center' } },
    { type: 'text', x: 880, y: labelY(3), width: 140, height: 30, id: 'd4v', zIndex: 1, props: { text: '+5.2 pp', fontSize: 25, color: '#ef4444' } },

    // Row 4: BB%
    { type: 'rect', x: 40, y: rowY(4), width: 1000, height: ROW_H, id: 'r5', zIndex: 0, props: { borderRadius: 12 }, color: '#18181b' },
    { type: 'text', x: 65, y: labelY(4), width: 120, height: 40, id: 'l5', zIndex: 1, props: { text: 'BB%', fontSize: 31, fontWeight: 'bold', color: '#71717a' } },
    { type: 'text', x: cx(LEFT_COL, 240), y: valY(4), width: 240, height: 60, id: 'v5a', zIndex: 1, props: { text: '7.3%', fontSize: 62, fontWeight: 'bold', color: '#a1a1aa', textAlign: 'center' } },
    { type: 'text', x: cx(RIGHT_COL, 240), y: valY(4), width: 240, height: 60, id: 'v5b', zIndex: 1, props: { text: '8.5%', fontSize: 62, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },
    { type: 'text', x: 880, y: labelY(4), width: 140, height: 30, id: 'd5v', zIndex: 1, props: { text: '+1.2 pp', fontSize: 25, color: '#10b981' } },

    // bottom info — centered on canvas
    { type: 'rect', x: 40, y: rowY(4) + ROW_H + 20, width: 1000, height: 2, id: 'd2', zIndex: 0, props: {}, color: '#27272a' },
    { type: 'text', x: cx(CC, 800), y: rowY(4) + ROW_H + 45, width: 800, height: 30, id: 'pa', zIndex: 1, props: { text: '1,205 PA (2023\u201325)  \u2022  141 PA (2026)', fontSize: 25, color: '#52525b', textAlign: 'center' } },
    { type: 'text', x: cx(CC, 800), y: rowY(4) + ROW_H + 85, width: 800, height: 35, id: 'tag', zIndex: 1, props: { text: 'Power surge: SLG up 132 pts in 2026', fontSize: 28, fontWeight: 'bold', color: '#10b981', textAlign: 'center' } },
    { type: 'text', x: cx(CC, 200), y: 1045, width: 200, height: 25, id: 'logo', zIndex: 1, props: { text: 'TRITON', fontSize: 22, fontWeight: 'bold', color: '#3f3f46', textAlign: 'center' } },
  ],
};

(async () => {
  const dir = '/Users/trevor/Desktop/Week of 4.20/Jordan Walker';
  mkdirSync(dir, { recursive: true });
  const png = await renderCardToPNG(scene);
  writeFileSync(`${dir}/Jordan Walker.png`, png);
  console.log('Saved!');
})();
