# Profe

Profe is a local-first pedagogical intelligence dashboard built with Next.js. It reads school planning files from the `data/` directory, normalizes them into a shared dataset, and renders a multi-view report for classes, teachers, schedules, curriculum coverage, and interdisciplinary opportunities.

The project is designed for school leadership and pedagogical coordination workflows where the source of truth already exists in spreadsheets, schedules, and curriculum documents rather than in a database.

## Table of Contents

- [What the app does](#what-the-app-does)
- [Core features](#core-features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Available commands](#available-commands)
- [Data inputs](#data-inputs)
- [How the app works](#how-the-app-works)
- [Project structure](#project-structure)
- [Known limitations](#known-limitations)
- [Deployment notes](#deployment-notes)
- [Additional docs](#additional-docs)

## What the app does

At runtime, the home page loads a single `SchoolIntelligenceDataset` from local files and passes it into the dashboard UI. The app then lets the user explore the dataset through seven views:

- `Summary`: high-level metrics, busiest classes, top teachers, top themes, and highlighted alerts.
- `Students`: student records and group assignments when nominal student data exists.
- `Classes`: class-level load, subject mix, documents, and tags.
- `Teachers`: teacher workload, class distribution, and teaching footprint.
- `Schedule`: timetable coverage by class and weekday.
- `Findings`: generated alerts about workload, coverage gaps, and isolated subjects.
- `Connections`: cross-subject opportunities, suggested projects, and the network map.

## Core features

- Loads source files directly from the local `data/` folder with no database required.
- Parses `CSV`, `DOCX`, `XLSX`, and `PDF` file metadata into a unified TypeScript data model.
- Detects shared curriculum themes through keyword scoring and subject defaults.
- Builds class, teacher, subject, document, alert, project, and network entities from the same dataset.
- Supports grade-based lenses for `School`, `6`, `7`, `8`, `9`, and `Maker`.
- Uses a client-side Zustand store to switch views and track the current selection.
- Renders charts, cards, and a force-directed knowledge map for exploratory analysis.

## Tech stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Zustand
- Framer Motion
- Recharts
- d3-force
- `csv-parse`, `mammoth`, `xlsx`, and `iconv-lite` for local file ingestion

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm
- The expected school source files inside `data/`

### Install dependencies

```bash
npm install
```

### Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

### Production build

```bash
npm run build
npm run start
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts the local Next.js development server. |
| `npm run build` | Creates a production build. |
| `npm run start` | Serves the production build. |

## Data inputs

The loader expects the following local sources:

- `data/Turmas JK - AF e EM - 2026.03.csv`
- `data/Equipe docente AF e EM - ABV e JK - 2026.03.csv`
- One schedule CSV whose filename starts with `1-Hor`
- `data/QDs - 2026/` with curriculum files in `DOCX`, `XLSX`, or `PDF`

Important ingestion assumptions:

- CSV files are decoded as `win1252`.
- CSV parsing uses `;` as the delimiter.
- The schedule file is discovered by filename prefix, not by an explicit config file.
- Curriculum traversal is recursive under `data/QDs - 2026/`.
- `PDF` files currently contribute filename metadata only; the app does not extract PDF body text.
- `XLSX` files are summarized from the first 40 populated rows of each sheet.

More detail: [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md)

## How the app works

1. The server page in `app/page.tsx` calls `loadSchoolIntelligenceData()`.
2. `lib/data-loader.ts` reads local files and builds a normalized `SchoolIntelligenceDataset`.
3. The dashboard client component slices that dataset by grade lens.
4. The selected view determines which scene is rendered in the main panel.
5. A side intelligence panel surfaces charts, alerts, and project suggestions for the active lens.

The app is local-first and read-only. It does not write back to source files or call a remote API for analytics.

## Project structure

```text
app/
  globals.css          Global visual system and layout tokens
  layout.tsx           Root layout and metadata
  page.tsx             Server entry point that loads the dataset
components/
  dashboard-app.tsx    Main dashboard shell and scene renderer
  intelligence-panel.tsx
                       Side panel charts, findings, and suggestions
  network-graph.tsx    Force-directed graph visualization
  ui/                  Small reusable UI primitives
data/
  README.md            Short note on source data ownership
  *.csv                Student, teacher, and schedule source files
  QDs - 2026/          Curriculum documents
lib/
  data-loader.ts       End-to-end parsing and intelligence generation
  taxonomy.ts          Grade options, view options, subjects, and shared tags
  utils.ts             Formatting and normalization helpers
store/
  dashboard-store.ts   Zustand UI state
types/
  index.ts             Shared TypeScript contracts for the dataset
docs/
  ARCHITECTURE.md      System design and module responsibilities
  DATA_PIPELINE.md     Detailed ingestion and inference reference
  DEVELOPMENT.md       Local workflow, maintenance, and extension guide
```

## Known limitations

- Student-level nominal records are currently available only for a subset of the source data. The app already warns about this when years `6` to `9` do not have student records.
- Many heuristics depend on filename conventions, keyword matching, and grade inference from raw text.
- Subject matching is rule-based, not ML-based, so new naming variations may need taxonomy updates.
- The app is optimized for the current school file set and may need parser updates for a different spreadsheet layout.
- Because source data is included in the app trace, deployment targets must have access to the same `data/` directory contents.

## Deployment notes

- `next.config.ts` includes `./data/**/*` in output tracing so the production build can access local files.
- `vercel.json` declares a standard Next.js deployment.
- Since the app relies on local files, hosted deployments only work when the deployment artifact contains the expected data directory.

## Additional docs

- [Architecture guide](docs/ARCHITECTURE.md)
- [Data pipeline reference](docs/DATA_PIPELINE.md)
- [Development guide](docs/DEVELOPMENT.md)
