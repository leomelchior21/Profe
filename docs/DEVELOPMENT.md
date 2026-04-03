# Development Guide

## Local workflow

### Install

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Start the production server

```bash
npm run start
```

## Key files to know first

- `app/page.tsx`: server entry point
- `components/dashboard-app.tsx`: main dashboard scenes and modal
- `components/intelligence-panel.tsx`: right-side analysis panel
- `components/network-graph.tsx`: interactive graph rendering
- `lib/data-loader.ts`: ingestion and intelligence pipeline
- `lib/taxonomy.ts`: domain vocabulary and theme catalog
- `store/dashboard-store.ts`: UI state only
- `types/index.ts`: shared contracts

## Extending the app

### Add a new subject or alias

Update `lib/taxonomy.ts`:

- add or edit a `SUBJECT_CATALOG` entry
- include aliases used in source files
- add schedule codes if the timetable uses abbreviations
- optionally define related subject ids for bridge-building logic

### Add a new dashboard section

Update:

- `types/index.ts` if a new `ViewMode` is needed
- `lib/taxonomy.ts` to expose the view in `VIEW_OPTIONS`
- `components/dashboard-app.tsx` to render the new scene
- `components/intelligence-panel.tsx` if the side panel should adapt to it

### Add a new inference rule

Most inference work belongs in `lib/data-loader.ts`.

Typical examples:

- new alert type
- different connection threshold
- new project naming rule
- richer document parsing
- stronger grade inference

When changing inference, keep these principles:

- prefer deterministic rules over opaque logic
- reuse existing helper functions
- preserve stable ids where possible
- update docs when file assumptions change

### Working with local data

This repository treats `data/` as runtime input, not sample fixtures.

Practical implications:

- do not rename source files casually
- keep file encodings consistent with current parser expectations
- review the loader before changing CSV layouts
- be careful with personal or school-sensitive data when sharing builds

### Styling and UI notes

- global visual tokens live in `app/globals.css`
- fonts are defined in `app/layout.tsx`
- small UI primitives live in `components/ui/`
- charts rely on Recharts
- motion and transitions rely on Framer Motion

### State management notes

Zustand stores only interaction state:

- active grade
- active mode
- selected entity

Do not move the parsed dataset into client state unless the architecture changes intentionally. The current design keeps data assembly on the server and interaction state on the client.

### Testing and verification

There is currently no dedicated automated test suite or lint script in `package.json`.

For now, the safest verification loop is:

1. run `npm run build`
2. run `npm run dev`
3. verify each dashboard mode with the expected local data present
4. confirm that grade switching and entity dialogs still behave correctly

Recommended future additions:

- ESLint script
- parser-focused unit tests for `lib/data-loader.ts`
- fixture-based regression tests for taxonomy matching

## Troubleshooting

### Build fails because a source file is missing

Check:

- `data/` still exists in the project root
- expected filenames are unchanged
- the schedule file still starts with `1-Hor`

### A subject is classified incorrectly

Check `lib/taxonomy.ts`:

- aliases
- schedule codes
- related subject ids

### A grade has no curriculum coverage

Check whether:

- documents mention the grade in their path, title, or extracted text
- the file is under `data/QDs - 2026/`
- the file extension is one of the supported types

### Text looks mis-encoded

The CSV parser already decodes `win1252`, but some source content can still surface as mojibake. If matching quality drops, inspect the original file encoding before changing normalization rules.

### Maintenance checklist

Use this checklist when preparing larger updates:

1. verify source filenames and folder layout
2. update taxonomy when new curriculum naming appears
3. build the app with the real data set
4. spot-check all seven dashboard sections
5. update markdown docs if any ingestion rule changed
