# Template Builder — User Guide

A visual, single-screen WYSIWYG editor for creating custom data-driven templates in the Triton Baseball Analytics Platform.

---

## Getting Started

The Template Builder lets you design reusable graphic layouts that automatically fill with data. Use it to create leaderboards, outing summaries, starter cards, and any custom stat graphic.

### Opening the Template Builder

- From the Visualize landing page (`/visualize`), click the **"Template Builder"** card.
- Direct URL: `/visualize/template-builder`
- To edit an existing template: `/visualize/template-builder?edit=<template-id>`
- To fork a built-in template: `/visualize/template-builder?fork=top-5-leaderboard`

---

## Interface Overview

The Template Builder uses the same canvas-based editor as the Scene Composer, with template-specific additions.

### Top Bar

- **Back arrow** — returns to `/visualize`
- **Template name** — click to rename
- **"Template Builder" badge** — identifies the current mode
- **Schema dropdown** — selects which data schema to use (Leaderboard, Pitcher Outing, Starter Card, Percentile Rankings, Generic)
- **Dimensions dropdown** — canvas size presets (default 1920×1080)
- **BG color picker** — set the background color
- **Undo/Redo buttons**
- **Zoom controls**
- **Preview button** — toggles between edit and preview mode
- **Save button** — saves the template to the database

### Left Panel: Element Library

Contains all available element types and text presets. Click elements to add them to the canvas.

- **Elements tab** — Stat Card, Text, Shape, Player Image, Stat Bar, and more
- **Presets tab** — Saved element presets from previous sessions

### Center: Canvas

The main workspace. Click to select elements, drag to move them, and use corner handles to resize. Multi-select with Shift+Click or marquee selection.

### Right Panel

Context-sensitive panel that shows different content based on selection:

- **When an element is selected:** Properties Panel + Template Binding section
- **When nothing is selected:** Repeater Panel

---

## Data Binding

Data binding connects element properties to data fields. When your template is loaded with real data, bound elements automatically display the correct values.

### How to Bind an Element

1. Select an element on the canvas (text, stat card, player image, or stat bar).
2. In the right panel, find the **"Template Binding"** section at the bottom.
3. Click the toggle to enable binding.
4. Choose a **Field** from the dropdown — this is the data column that will fill in the value.
5. For stat cards: optionally change the **Target Property** (Value, Label, or Sublabel).
6. Choose a **Format** if needed (Raw, 1 Decimal, Integer, Percent, .3f).

### Bound Element Display

Once bound, the element shows the field name in curly braces as a placeholder, e.g. `{player_name}` or `{primary_value}`. The **BOUND** badge appears in the binding section header.

### Available Fields by Schema

#### Leaderboard Schema

| Field | Description |
|-------|-------------|
| `rank` | Row rank number (1, 2, 3...) |
| `player_id` | MLB player ID — use with Player Image elements |
| `player_name` | Full player name (Last, First) |
| `primary_value` | Main stat value |
| `secondary_value` | Optional second stat |
| `tertiary_value` | Optional third stat |

#### Pitcher Outing Schema

| Field | Description |
|-------|-------------|
| `pitcher_id` | Pitcher MLB ID |
| `pitcher_name` | Pitcher name |
| `game_date` | Date of the game |
| `opponent` | Opposing team abbreviation |
| `game_line.ip` | Innings pitched |
| `game_line.h` | Hits allowed |
| `game_line.r` | Runs allowed |
| `game_line.er` | Earned runs |
| `game_line.bb` | Walks |
| `game_line.k` | Strikeouts |
| `game_line.pitches` | Total pitch count |
| `command.waste_pct` | Waste pitch percentage |
| `command.avg_cluster` | Average cluster score |
| `command.avg_brink` | Average brink score |

#### Starter Card Schema

| Field | Description |
|-------|-------------|
| `pitcher_id` | Pitcher MLB ID |
| `pitcher_name` | Pitcher name |
| `p_throws` | Throwing hand (L/R) |
| `team` | Team abbreviation |
| `age` | Player age |
| `game_date` | Date of the game |
| `opponent` | Opposing team |
| `game_line.ip` | Innings pitched |
| `game_line.er` | Earned runs |
| `game_line.k` | Strikeouts |
| `game_line.pitches` | Total pitch count |
| `game_line.csw_pct` | Called strike + whiff percentage |
| `grades.start` | Start grade |
| `grades.stuff` | Stuff grade |
| `grades.command` | Command grade |
| `grades.triton` | Triton grade |

#### Percentile Rankings Schema

| Field | Description |
|-------|-------------|
| `metric_name` | Name of the metric |
| `percentile_value` | Percentile ranking (0–100) |
| `raw_value` | Raw stat value |

#### Generic Schema

| Field | Description |
|-------|-------------|
| `player_id` | MLB player ID |
| `player_name` | Player name |
| `stat_value` | Stat value |
| `stat_label` | Stat label text |

---

## Repeater System

The repeater duplicates a group of elements for each row of data — perfect for leaderboard rows, stat lists, and ranking graphics.

### Creating a Repeater

1. Design a single "row" of elements on the canvas — for example: a rank text, player headshot, name text, and stat cards.
2. Bind each element to the appropriate data field.
3. Multi-select all row elements using Shift+Click.
4. Deselect all (click empty canvas space) — the right panel now shows the **Repeater Panel**.
5. Click **"Create Repeater"** (shows count of selected elements).

### Configuring the Repeater

- **Count** — how many rows to generate (default: 5)
- **Direction** — Vertical (rows stack downward) or Horizontal (rows go right)
- **Offset (px)** — spacing between each repeated group (default: 160px)

### Ghost Previews

After creating a repeater, the canvas shows translucent (30% opacity) ghost copies of your row at the configured offset. These show you exactly where repeated rows will appear without cluttering the editor.

### Removing a Repeater

Click **"Remove Repeater"** in the Repeater Panel to dissolve the group. Your original elements remain intact.

---

## Preview Mode

Click the **"Preview"** button in the top bar to see your template filled with sample data. In preview mode:

- All bound elements display realistic sample values
- Repeaters expand to show all rows with data
- The canvas becomes read-only (no selection or editing)
- Click **"Edit"** to return to editing mode

---

## Saving & Loading

### Saving a Template

- Click **"Save New"** to create a new template in the database.
- After the first save, the button changes to **"Save"** and updates in place.
- Keyboard shortcut: `Cmd+S` (Mac) / `Ctrl+S` (Windows).
- The template ID appears in the status bar after saving.

### Editing an Existing Template

Navigate to `/visualize/template-builder?edit=<template-id>` to load and modify a previously saved template. All changes save back to the same record.

### Forking a Built-in Template

Navigate to `/visualize/template-builder?fork=top-5-leaderboard` (or another built-in template ID) to load a copy of that template for customization. Saving creates a new custom template.

---

## Using Custom Templates in Scene Composer

1. Open the Scene Composer (`/visualize/scene-composer`).
2. Click the **"Templates"** tab in the left Element Library panel.
3. Expand the **"Custom"** section (cyan-colored, appears above the built-in categories).
4. Click your custom template to load it into the composer.
5. Configure the template settings (stats, date range, etc.) in the right panel.
6. The template auto-populates with real data from the database.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected element |
| `Cmd+D` | Duplicate selected element |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+S` | Save template |
| Arrow keys | Nudge selected element 1px |
| `Shift+Arrow` | Nudge selected element 10px |
| `Shift+Click` | Multi-select elements |

---

## Tips & Best Practices

- **Start by choosing the right schema** — it determines which fields are available for binding.
- **Design one complete row first**, then create the repeater. It's easier to adjust the layout before repeating.
- **Use Preview mode frequently** to verify your bindings and layout look correct with real data.
- **Stat Cards are ideal for numeric values** — bind the value, then manually set the label text.
- **Player Image elements** automatically fetch headshots when bound to a `player_id` field.
- **Use the format option** to control decimal places: `1f` for one decimal, `3f` for batting averages, `percent` to append a % sign.
- **The status bar** at the bottom shows element count, schema type, binding count, and repeater config at a glance.
