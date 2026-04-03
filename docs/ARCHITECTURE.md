# Architecture Guide

## Overview

Profe is a single-page Next.js dashboard backed by a local file ingestion pipeline. There is no external database and no internal API layer. The main architectural pattern is:

1. Read local source files on the server.
2. Normalize them into one in-memory dataset.
3. Pass that dataset into a client dashboard.
4. Filter and visualize the data by grade lens and report section.

## Runtime flow

### 1. Server entry point

`app/page.tsx` is the only page in the app. It calls `loadSchoolIntelligenceData()` and renders `DashboardApp`.

### 2. Dataset assembly

`lib/data-loader.ts` is the core application engine. It:

- finds the schedule file dynamically
- reads student, teacher, and schedule CSVs
- walks the curriculum directory recursively
- parses curriculum documents into searchable metadata
- builds classes, subjects, alerts, connections, projects, and network nodes
- returns a `SchoolIntelligenceDataset`

The loader is wrapped with React `cache()` so repeated reads in the same server execution context can reuse the same parsed result.

### 3. Client dashboard

`components/dashboard-app.tsx` receives the full dataset and derives a grade-scoped lens via `buildLensData(...)`. The user can switch grade scope and report section without refetching any server data.

### 4. Side intelligence panel

`components/intelligence-panel.tsx` computes derived chart data from the active lens and mirrors the currently selected entity.

## Main modules

### `lib/data-loader.ts`

Responsibilities:

- file discovery
- encoding-aware CSV ingestion
- teacher and class normalization
- curriculum parsing and keyword extraction
- shared-theme scoring
- alert and project suggestion generation
- network graph generation
- grade summary generation

This file is intentionally central. Any logic changes to how the school data is interpreted will usually start here.

### `lib/taxonomy.ts`

Provides configuration-like domain knowledge:

- grade options
- dashboard view options
- timetable day and slot constants
- subject catalog
- shared interdisciplinary tags and their keywords

If a new subject alias, schedule code, or shared theme needs to be supported, this file is usually the right place.

### `types/index.ts`

Defines the contracts that tie the ingestion pipeline and UI together:

- input-derived records such as `StudentRecord`, `TeacherRecord`, `ClassRecord`, and `CurriculumDocument`
- derived intelligence types such as `InterdisciplinaryConnection`, `InsightAlert`, `ProjectSuggestion`, and `NetworkNode`
- the top-level `SchoolIntelligenceDataset`

### `components/dashboard-app.tsx`

This is the application shell. It contains:

- the control rail for grade and section selection
- the scene renderer for the seven report modes
- the modal dialog for drilling into a selected entity

The active scene is driven by two state values:

- `activeGrade`
- `activeMode`

### `store/dashboard-store.ts`

Stores only UI state, not data state:

- active grade
- active mode
- currently selected entity

The data itself stays immutable and is passed into the dashboard component tree.

## View architecture

The dashboard exposes seven modes defined in `lib/taxonomy.ts`:

- `overview`
- `students`
- `classes`
- `teachers`
- `schedule`
- `insights`
- `interdisciplinary`

Each mode maps to a scene function inside `components/dashboard-app.tsx`. This keeps the app in one navigable page while still organizing behavior by report type.

## Data model layers

The app operates on three conceptual layers.

### Source layer

Raw school files:

- student CSV
- teacher CSV
- schedule CSV
- curriculum documents

### Normalized layer

Shared records:

- students
- teachers
- schedule entries
- classes
- subjects
- documents

### Intelligence layer

Derived records:

- grade summaries
- interdisciplinary connections
- findings and alerts
- grouped project suggestions
- network nodes and links

## Inference model

Most app intelligence is heuristic and transparent rather than opaque.

Examples:

- grade detection is inferred from class labels and document text
- subject classification is rule-based from aliases and schedule codes
- shared themes are scored from keyword frequency plus default subject tags
- alerts are generated from thresholds such as workload concentration and missing coverage
- projects are synthesized from the strongest interdisciplinary connections

This design makes the system easier to adapt for a specific school, but it also means taxonomy quality directly affects output quality.

## Visual architecture

The interface is a three-column dashboard:

- left rail for navigation and grade scope
- center panel for the selected report scene
- right rail for contextual intelligence

Styling choices:

- Tailwind CSS 4 for utility styling
- Framer Motion for panel and scene transitions
- Recharts for charts
- d3-force for the knowledge map layout

## Deployment architecture

The app can be deployed as a standard Next.js app, but the local data directory is part of the runtime contract.

`next.config.ts` includes:

- `optimizePackageImports` for `lucide-react` and `recharts`
- `outputFileTracingIncludes` for `./data/**/*`

Without the expected `data/` files present in the build output, the page will fail at runtime during dataset loading.

## Change impact guide

When making changes, these are the safest entry points:

- new subject names or codes: update `lib/taxonomy.ts`
- new data fields in the shared dataset: update `types/index.ts` and `lib/data-loader.ts`
- new scene or panel UI: update `components/dashboard-app.tsx` and related components
- new alert logic or inference rules: update `lib/data-loader.ts`

If the file layout in `data/` changes, review the pipeline carefully before changing only one parser. Most downstream structures assume the current naming and folder conventions.
