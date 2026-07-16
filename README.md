# TimeTrek

An interactive timeline that spans from a single hour to the entire history of the universe.

TimeTrek renders events and durations on a zoomable canvas across 15 time scales — from **Hour** all the way out to **Billion Years** — so the same timeline can hold both "Tuesday's 3pm meeting" and "the formation of Earth, 4.5 billion years ago." Items nest into hierarchies you can expand and collapse, so a decades-long life story can drill down into a single afternoon.

No build step, no dependencies, no server-side anything. It's vanilla JavaScript ES modules, with items rendered as DOM and the axis drawn on a `<canvas>`.

## Quick start

Download or clone this repo, then:

| | |
|---|---|
| **macOS** | Double-click **`Start TimeTrek.command`** |
| **Windows** | Double-click **`Start TimeTrek.bat`** |
| **Linux** | Run **`./start-timetrek.sh`** |

A terminal window opens, the app opens in your browser, and you're going. Leave that window open while you use TimeTrek; closing it stops the server.

Then click **Open Sample Project** for a populated 81-item timeline to poke at, or **New Project** to start empty. **Download sample project** saves that same demo as a `.timetrek.json` file.

<details>
<summary>Prefer to do it yourself, or the launcher didn't work?</summary>

Any static file server will do:

```bash
python3 -m http.server 8000     # or: npx serve
```

Then open <http://localhost:8000>.

**Why is a server needed at all?** There's no build step, but the app loads its JavaScript as ES modules, and browsers refuse to load modules over `file://` (the origin is `null`, so it trips CORS). Opening the HTML files by double-clicking them will not work. The launcher scripts just start one of these servers for you.

**The launcher needs Python, Ruby, or Node** — it uses whichever it finds. macOS no longer ships Python, so if none are present the script says so and points you at [python.org](https://www.python.org/downloads/).

**macOS may refuse to open the launcher** if you downloaded the repo as a ZIP, saying it's *"from an unidentified developer"* — that's Gatekeeper quarantining downloaded files. Right-click the file → **Open** → **Open**, once. Cloning with `git` instead avoids this entirely.

</details>

## How it works

**Projects** (`index.html`) is the entry point: a grid of your timelines, stored in the browser's `localStorage`. Create, rename, delete, or export them. Nothing is uploaded anywhere — your data stays in your browser.

**The timeline** (`timeline.html?project=<id>`) is the canvas view. Pan and zoom continuously, or jump to a fixed scale with the buttons along the bottom. **Fit All** frames every item in the project at once, however far apart they are. Changes auto-save back to the project after a 500ms debounce.

### Data model

Every item is one of two types:

- **`duration`** — has a start and an end date; renders as a bar.
- **`event`** — a single point in time; renders as a marker.

Items nest via `Parent Item`, which references another item's name. Parents render as expandable bars containing their children.

### Editing

**+ Add Item** opens a form prefilled with the date currently centred on screen. Double-clicking empty space on the timeline does the same, prefilled with the date you clicked. Pick a **Parent** to nest the item; the dropdown lists the existing hierarchy and hides the item's own descendants, so you can't make a loop.

Click the pencil beside any item to edit it, including moving it to a different parent. **Delete** asks first: by default an item's children move up to take its place, or you can tick the box to delete the whole subtree.

Dates use `input[type=date]`, so **the form can only express real calendar dates (years 1–9999)**. Deep-time items (`4.5 BYA`, `3000 BC`) can be imported from CSV and will render fine, but their date field shows blank in the form and can only be changed by editing the CSV/JSON. Editing such an item's name or notes is safe — leaving the date blank keeps the existing date rather than clearing it.

### Importing CSV

**Import CSV** accepts a file with these columns:

| Column        | Required | Notes                                        |
|---------------|----------|----------------------------------------------|
| `Item Name`   | Yes      | Also used as the parent reference key         |
| `Type`        | Yes      | `duration` or `event`                         |
| `Start Date`  | Yes      | See date formats below                        |
| `End Date`    | No       | `duration` items only                         |
| `Parent Item` | No       | Name of the parent item; blank means top level |
| `Notes`       | No       | Free text                                     |

```csv
Item Name,Type,Start Date,End Date,Parent Item,Notes
Life of Jack,duration,1980-01-01,2022-06-02,,Full biography
Childhood,duration,1980-01-01,1998-06-15,Life of Jack,Growing up in California
Born,event,1980-01-01,,Childhood,Born in San Francisco
```

### Date formats

Standard calendar dates:

- `YYYY-MM-DD` — `1980-01-01`
- `MM/DD/YYYY` — `01/01/1980`
- `DD-MM-YYYY` — `01-01-1980`
- Plain year — `2025`, or `-500` for 500 BC

Deep time, for anything the `Date` object can't hold:

- `4.5 BYA` — billions of years ago
- `65 MYA` — millions of years ago
- `10 KYA` — thousands of years ago
- `3000 BC` / `3000 BCE`
- `2025 AD` / `2025 CE`

Deep-time values are positioned by day offset from today rather than by a real `Date`, which is what lets the timeline reach back to the Big Bang without overflowing.

### JSON export/import

**Export JSON** downloads a `.timetrek.json` file containing the items and the saved view state, tagged with a `_format: "timetrek-v1"` marker. Importing a file without that marker is rejected. Imported projects are assigned a fresh ID, so importing your own export creates a copy rather than overwriting the original.

## Project layout

```
index.html          Project list — the entry point; inlines the logo mark as SVG
timeline.html       Timeline view
favicon.svg         Simplified logo mark for the browser tab
style.css           Design tokens (:root) + all UI styling
start-timetrek.sh   Local server + browser launcher (macOS/Linux)
Start TimeTrek.command   macOS double-click wrapper for the above
Start TimeTrek.bat  Local server + browser launcher (Windows)
js/
  main.js           Timeline bootstrap, button wiring
  projects-main.js  Projects page bootstrap
  sampleData.js     Demo dataset shared by both pages
  Timeline.js       Core controller — input, edit modal
  TimelineData.js   Data model, CSV parsing, hierarchy, layout
  ItemsLayer.js     Renders items as DOM over the canvas
  TimelineRenderer.js  Canvas drawing — the axis only
  TimelineAnimator.js  Zoom/pan easing
  TimeScale.js      The 15 scale definitions
  DateParser.js     Date parsing, including deep time
  ProjectManager.js localStorage CRUD, JSON serialization
```

`window.timeline` and `window.TimeScale` are exposed in the console for poking at a live timeline or registering custom scales.

## Contributing

Issues and pull requests are welcome. There's no test suite or build tooling — verify changes by serving the app locally and exercising the flow you touched.

Colours and the font stack live as custom properties in the `:root` block at the top of `style.css` — restyle there rather than editing rules individually. The button fill tokens (`--color-primary`, `--color-secondary`) are deliberately darker than `--color-brand` so white labels clear WCAG AA contrast; `--color-brand` is for display type only. Timeline items cycle through `--level-0..5` (bars) and `--event-0..5` (events) by nesting depth.

### Why items are DOM and the axis is canvas

Items are elements, so they can be styled with the tokens above, reached by keyboard and screen readers, and hit-tested by the browser. The axis stays on canvas: its tick marks are dense, redrawn every frame, and there's nothing there to inspect or read aloud.

Only ~30–50 items are ever on screen at once — bars are 20px tall, and collapsed branches aren't laid out — so the DOM cost is small. Measured at 35 items: ~0.7ms per frame for layout, axis, and item updates combined, against a 16.7ms budget.

`ItemsLayer` clamps each element to the viewport. Browsers cap element size near 33.5M pixels, and at maximum zoom (2400 px/day) a 42-year bar computes to ~37M px wide. Canvas didn't care because it drew off into nowhere; an element would render wrong. Corners are rounded only on ends that are genuinely the item's ends, so a clamped end doesn't read as the bar stopping at the screen edge.

## License

MIT — see [LICENSE](LICENSE).
