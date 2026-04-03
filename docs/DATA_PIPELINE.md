# Data Pipeline Reference

## Purpose

This document explains how Profe turns local school files into the `SchoolIntelligenceDataset` consumed by the UI.

## Source files

The loader currently expects these inputs:

- `data/Turmas JK - AF e EM - 2026.03.csv`
- `data/Equipe docente AF e EM - ABV e JK - 2026.03.csv`
- a schedule CSV whose filename starts with `1-Hor`
- all files under `data/QDs - 2026/`

## Discovery rules

- The root data folder is `process.cwd()/data`.
- The curriculum root is `data/QDs - 2026`.
- The schedule file is found by scanning `data/` for the first `.csv` that starts with `1-Hor`.
- Curriculum discovery is recursive and includes nested grade and subject folders.

If the schedule file is renamed without preserving the prefix, the loader throws an error.

## Parsing details

### Student CSV

Source: `Turmas JK - AF e EM - 2026.03.csv`

Behavior:

- decoded as `win1252`
- parsed with `;` separators
- reads class label, student name, registry, email, and group assignments
- infers grade from class labels such as `6`, `7`, `8`, `9`
- always assigns campus `JK`

Output type:

- `StudentRecord[]`

### Teacher CSV

Source: `Equipe docente AF e EM - ABV e JK - 2026.03.csv`

Behavior:

- decoded as `win1252`
- parsed with `;` separators
- reads teacher name, component, load totals, class-by-class periods, and optional email
- splits ABV and JK class loads using fixed column ranges
- resolves a canonical subject through `resolveSubjectDefinition(...)`
- derives grade coverage from class headers

Output type:

- teacher seeds that later become `TeacherRecord[]`

### Schedule CSV

Source: first matching file with prefix `1-Hor`

Behavior:

- decoded as `win1252`
- parsed with `;` separators
- scans row blocks for teacher-centered schedule tables
- extracts both teacher schedule entries and class schedule entries
- assigns day, slot, grade, label, and campus metadata

Output type:

- `ScheduleEntry[]` for teachers
- `ScheduleEntry[]` for classes

### Curriculum documents

Supported types:

- `.docx`
- `.xlsx`
- `.pdf`

Behavior by type:

- `DOCX`: raw text is extracted with `mammoth`
- `XLSX`: sheet previews are generated from the first 40 populated rows per sheet
- `PDF`: only the filename is currently used as text input

For every relevant file, the loader computes:

- relative path
- inferred title
- subject classification
- inferred grades
- extracted sections
- excerpt
- keywords
- shared tag scores

Output type:

- `CurriculumDocument[]`

### Normalization helpers

Key helper concepts:

- `normalizeText(...)` removes accents and lowercases text
- `slugify(...)` creates stable ids
- `inferGradeFromClassLabel(...)` extracts grade from class naming
- `resolveSubjectDefinition(...)` maps raw subject names to the subject catalog
- `unique(...)`, `sum(...)`, and `average(...)` are used heavily in aggregation

### Subject resolution

Subjects are matched using the catalog in `lib/taxonomy.ts`.

Matching order:

1. schedule code exact match
2. alias inclusion match
3. exact label match
4. fallback synthetic subject generated from the raw label

This means new spreadsheet naming conventions can usually be supported by expanding aliases and schedule codes instead of rewriting parsing logic.

### Shared theme extraction

Shared curriculum tags are defined in `SHARED_TAGS`.

Each tag contains:

- display metadata
- keyword list
- complementary tags used to surface hidden opportunities

Scoring model:

- keyword matches increase score
- repeated matches are capped
- multi-word keywords receive a small weight bonus
- subjects can receive extra baseline score from `SUBJECT_DEFAULT_TAGS`
- only positive-score tags are kept
- the top results are attached to documents, subjects, and classes

### Derived entities

After raw parsing, the loader builds higher-level records.

### Classes

Built from schedule entries plus linked teachers, students, and documents.

Notable fields:

- `weeklyLoad`
- `averageDailyLoad`
- `busiestDay`
- `subjectLoads`
- `tags`
- `documents`

### Subjects

Built from teachers, documents, and class records.

Notable fields:

- `grades`
- `classIds`
- `teacherIds`
- `documentIds`
- `tags`
- `scheduleCodes`

### Interdisciplinary connections

Built by comparing subjects pairwise.

A connection is created when:

- subjects overlap in grade coverage
- their shared or complementary tag score passes the threshold

Each connection includes:

- `sharedTags`
- `score`
- `strength`
- `rationale`
- `opportunity`
- `gradeKeys`

### Project suggestions

Generated from the strongest connections. Titles are either:

- selected from predefined combinations in `PROJECT_TITLES`
- or synthesized as `Projeto integrador: Subject A + Subject B`

### Alerts

Alerts are heuristic, not manually authored.

Current alert families:

- teacher overload concentration
- class load deviation from the median
- isolated subjects with weak curriculum bridges
- lack of student-level coverage in final years
- low curriculum document counts per grade

### Network graph

The knowledge map is built from:

- class nodes
- teacher nodes
- subject nodes
- topic nodes generated from top aggregated tags

Links are created for:

- class to subject
- teacher to subject
- teacher to class
- subject to topic

### Grade summaries

Each grade lens stores:

- class count
- teacher count
- curriculum count
- connection count
- top tags
- coverage status

The `maker` lens is handled specially because it cuts across grade boundaries.

### Operational caveats

- Parsing depends on current file shapes and fixed column ranges.
- `PDF` support is metadata-only today.
- Grade inference can fall back to `other` when the text is ambiguous.
- Encoded source files may display mojibake in raw text, but normalization still supports matching in many cases.
- Student availability is partial by design in the current dataset.

### When to update this pipeline

Review `lib/data-loader.ts` and `lib/taxonomy.ts` when any of the following changes:

- new source filenames
- different CSV column layouts
- new subjects or aliases
- new grade labels
- new curriculum folders
- new interdisciplinary themes
