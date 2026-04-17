#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// ── Supabase Client ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xgzxfsqwtemlcosglhzr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_KEY) {
  console.error("Warning: SUPABASE_SERVICE_ROLE_KEY not set. Database tools will fail.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ─────────────────────────────────────────────────────────────────

async function runQuery(sql: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("run_query", { query_text: sql.trim() });
  if (error) throw new Error(`Query failed: ${error.message}`);
  return data || [];
}

async function runQueryLong(sql: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("run_query_long", { query_text: sql.trim() });
  if (error) throw new Error(`Query failed: ${error.message}`);
  return data || [];
}

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const csvRows = [headers.join(",")];
  for (const row of rows) {
    csvRows.push(
      headers
        .map((h) => {
          const val = row[h];
          if (val == null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    );
  }
  return csvRows.join("\n");
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "triton-tools",
  version: "1.0.0",
});

// ── Tool 1: Query Database ──────────────────────────────────────────────────

server.tool(
  "query_database",
  "Run a SQL query against the Triton baseball database. The database has 7.4M+ pitch rows (2015-2026) with 90+ columns including velocity, movement, location, events, and Statcast metrics. Key tables: pitches, players, game_umpires, umpire_challenges, pitcher_season_command, pitcher_season_deception, league_metric_baselines, daily_cards, briefs. Use run_query for fast queries, run_query_long for heavy ones (50k+ rows).",
  {
    sql: z.string().describe("SQL SELECT query to execute"),
    long: z.boolean().optional().describe("Use long-running query (120s timeout) for heavy queries. Default false."),
  },
  async ({ sql, long }) => {
    try {
      const rows = long ? await runQueryLong(sql) : await runQuery(sql);
      const preview = rows.slice(0, 50);
      const text = rows.length === 0
        ? "No results."
        : `${rows.length} rows returned${rows.length > 50 ? " (showing first 50)" : ""}:\n${JSON.stringify(preview, null, 2)}`;
      return { content: [{ type: "text", text }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 2: Search Players ──────────────────────────────────────────────────

server.tool(
  "search_players",
  "Search for baseball players by name. Returns player ID, name, position, and team. Use this to find player IDs before querying pitch data.",
  {
    name: z.string().describe("Player name to search for (partial match)"),
    type: z.enum(["all", "pitcher", "batter"]).optional().describe("Filter by player type. Default 'all'."),
    limit: z.number().optional().describe("Max results. Default 10."),
  },
  async ({ name, type, limit }) => {
    try {
      const rpcName = type === "batter" ? "search_batters" : type === "pitcher" ? "search_players" : "search_all_players";
      const { data, error } = await supabase.rpc(rpcName, {
        search_term: name.trim(),
        result_limit: limit || 10,
      });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return { content: [{ type: "text", text: `No players found matching "${name}".` }] };
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 3: Export CSV ──────────────────────────────────────────────────────

server.tool(
  "export_csv",
  "Run a SQL query and export the results as a CSV file. Returns the file path.",
  {
    sql: z.string().describe("SQL SELECT query to execute"),
    filename: z.string().describe("Output filename (without .csv extension)"),
    output_dir: z.string().optional().describe("Directory to save the CSV. Default: ~/Desktop"),
    long: z.boolean().optional().describe("Use long-running query for heavy queries. Default false."),
  },
  async ({ sql, filename, output_dir, long }) => {
    try {
      const rows = long ? await runQueryLong(sql) : await runQuery(sql);
      if (rows.length === 0) return { content: [{ type: "text", text: "No results to export." }] };

      const csv = toCsv(rows);
      const dir = output_dir || path.join(process.env.HOME || "/tmp", "Desktop");
      const filePath = path.join(dir, `${filename}.csv`);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, csv, "utf-8");

      return {
        content: [{ type: "text", text: `Exported ${rows.length} rows to ${filePath}` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool 4: Render Graphic ──────────────────────────────────────────────────

server.tool(
  "render_graphic",
  "Render a Triton scene as a PNG image. Build a scene with elements (text, shapes, player-image, stat-card) and render it to a file. Uses the same scene format as the Triton Scene Composer.",
  {
    scene: z.object({
      width: z.number().describe("Canvas width in pixels"),
      height: z.number().describe("Canvas height in pixels"),
      background: z.string().describe("Background color (hex)"),
      elements: z.array(z.any()).describe("Array of scene elements"),
    }).describe("Scene definition with width, height, background, and elements array"),
    filename: z.string().describe("Output filename (without .png extension)"),
    output_dir: z.string().optional().describe("Directory to save the PNG. Default: ~/Desktop"),
  },
  async ({ scene, filename, output_dir }) => {
    try {
      // Dynamically import the render function from the parent project
      const projectRoot = path.resolve(import.meta.dirname, "../..");
      const { renderCardToPNG } = await import(path.join(projectRoot, "lib/serverRenderCard"));

      const fullScene = { id: "mcp-render", name: filename, ...scene };
      const png = await renderCardToPNG(fullScene);

      const dir = output_dir || path.join(process.env.HOME || "/tmp", "Desktop");
      const filePath = path.join(dir, `${filename}.png`);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, png);

      return {
        content: [{ type: "text", text: `Rendered ${scene.width}x${scene.height} graphic to ${filePath}` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Render error: ${err.message}\n\nNote: render_graphic requires the Triton project's dependencies. Run from the project root.` }] };
    }
  }
);

// ── Tool 5: Get Player Stats ────────────────────────────────────────────────

server.tool(
  "get_player_stats",
  "Get comprehensive hitting or pitching stats for a player in a given season. Returns traditional stats (AVG/OBP/SLG/OPS for hitters, ERA/WHIP/K%/BB% for pitchers) plus Statcast metrics.",
  {
    player_id: z.number().describe("MLB player ID"),
    season: z.number().optional().describe("Season year. Default: current year."),
    type: z.enum(["pitcher", "hitter"]).describe("Whether to get pitching or hitting stats"),
  },
  async ({ player_id, season, type }) => {
    try {
      const year = season || new Date().getFullYear();
      const col = type === "pitcher" ? "pitcher" : "batter";

      const sql = type === "pitcher"
        ? `SELECT
            COUNT(DISTINCT game_pk) as games,
            COUNT(*) as pitches,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
            ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
            ROUND(MAX(release_speed)::numeric, 1) as max_velo,
            ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
            ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
            ROUND(100.0 * COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked')) / NULLIF(COUNT(*) FILTER (WHERE description IN ('swinging_strike','swinging_strike_blocked','foul','foul_tip','hit_into_play','hit_into_play_no_out','hit_into_play_score')), 0), 1) as whiff_pct,
            ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as xwoba,
            ROUND(AVG(launch_speed)::numeric FILTER (WHERE launch_speed IS NOT NULL), 1) as avg_ev,
            ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1) as hard_hit_pct,
            ROUND(AVG(stuff_plus)::numeric, 0) as avg_stuff_plus
          FROM pitches WHERE ${col} = ${player_id} AND game_year = ${year} AND game_type = 'R' AND pitch_type NOT IN ('PO','IN')`
        : `SELECT
            COUNT(DISTINCT game_pk) as games,
            COUNT(*) as pitches,
            COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
            COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run')) as hits,
            COUNT(*) FILTER (WHERE events = 'home_run') as hr,
            COUNT(*) FILTER (WHERE events = 'double') as doubles,
            COUNT(*) FILTER (WHERE events = 'triple') as triples,
            COUNT(*) FILTER (WHERE events = 'walk') as bb,
            COUNT(*) FILTER (WHERE events LIKE '%strikeout%') as k,
            ROUND(AVG(launch_speed)::numeric FILTER (WHERE launch_speed IS NOT NULL), 1) as avg_ev,
            ROUND(AVG(launch_angle)::numeric FILTER (WHERE launch_angle IS NOT NULL), 1) as avg_la,
            ROUND(AVG(estimated_ba_using_speedangle)::numeric FILTER (WHERE estimated_ba_using_speedangle IS NOT NULL), 3) as xba,
            ROUND(AVG(estimated_woba_using_speedangle)::numeric FILTER (WHERE estimated_woba_using_speedangle IS NOT NULL), 3) as xwoba,
            ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95) / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1) as hard_hit_pct,
            ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6') / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1) as barrel_pct,
            ROUND(AVG(bat_speed)::numeric FILTER (WHERE bat_speed IS NOT NULL), 1) as bat_speed
          FROM pitches WHERE ${col} = ${player_id} AND game_year = ${year} AND game_type = 'R' AND pitch_type NOT IN ('PO','IN')`;

      const rows = await runQuery(sql);
      if (!rows.length || !rows[0].games) {
        return { content: [{ type: "text", text: `No ${year} ${type} data found for player ${player_id}.` }] };
      }

      // Get player name
      const { data: player } = await supabase.from("players").select("name").eq("id", player_id).single();
      const stats = rows[0];

      // Compute derived stats for hitters
      if (type === "hitter" && stats.pa > 0) {
        const ab = stats.pa - stats.bb - (stats.hbp || 0);
        stats.avg = ab > 0 ? (stats.hits / ab).toFixed(3) : null;
        stats.obp = stats.pa > 0 ? ((stats.hits + stats.bb) / stats.pa).toFixed(3) : null;
        const tb = stats.hits + stats.doubles + stats.triples * 2 + stats.hr * 3;
        stats.slg = ab > 0 ? (tb / ab).toFixed(3) : null;
        stats.ops = stats.obp && stats.slg ? (parseFloat(stats.obp) + parseFloat(stats.slg)).toFixed(3) : null;
      }

      return {
        content: [{
          type: "text",
          text: `${player?.name || `Player ${player_id}`} — ${year} ${type === "pitcher" ? "Pitching" : "Hitting"} Stats:\n${JSON.stringify(stats, null, 2)}`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Start Server ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Triton MCP Server started — tools: query_database, search_players, export_csv, render_graphic, get_player_stats");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
