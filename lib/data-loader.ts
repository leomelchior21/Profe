import { cache } from "react";

import path from "node:path";
import { promises as fs } from "node:fs";

import { parse as parseCsv } from "csv-parse/sync";
import iconv from "iconv-lite";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import {
  DAYS,
  GRADE_OPTIONS,
  SHARED_TAGS,
  SUBJECT_CATALOG,
  type SubjectDefinition,
} from "@/lib/taxonomy";
import {
  average,
  byScoreDesc,
  formatGradeLabel,
  groupBy,
  normalizeText,
  slugify,
  sum,
  titleCase,
  unique,
} from "@/lib/utils";
import type {
  ClassRecord,
  ConnectionStrength,
  CurriculumDocument,
  GradeKey,
  GradeSummary,
  InsightAlert,
  InterdisciplinaryConnection,
  NetworkLink,
  NetworkNode,
  ProjectSuggestion,
  ScheduleEntry,
  SchoolIntelligenceDataset,
  SharedTagScore,
  StudentGroupAssignment,
  StudentRecord,
  SubjectRecord,
  TeacherLoad,
  TeacherRecord,
} from "@/types";

const ROOT = path.join(/* turbopackIgnore: true */ process.cwd());
const DATA_ROOT = path.join(ROOT, "data");
const CURRICULUM_ROOT = path.join(DATA_ROOT, "QDs - 2026");
const STUDENTS_FILE = path.join(DATA_ROOT, "Turmas JK - AF e EM - 2026.03.csv");
const TEACHERS_FILE = path.join(DATA_ROOT, "Equipe docente AF e EM - ABV e JK - 2026.03.csv");
const SCHEDULE_FILE_PREFIX = "1-Hor";

const STOP_WORDS = new Set([
  "para",
  "com",
  "dos",
  "das",
  "que",
  "uma",
  "como",
  "mais",
  "anos",
  "ano",
  "nos",
  "nas",
  "por",
  "ser",
  "entre",
  "sobre",
  "cada",
  "seus",
  "suas",
  "pelo",
  "pela",
  "livro",
  "unidade",
  "capitulo",
  "capítulo",
  "tema",
  "conteudo",
  "conteúdo",
  "objetivos",
  "aprendizagem",
  "curriculo",
  "currículo",
  "planejamento",
  "bimestre",
  "gerais",
  "basica",
  "básica",
  "projeto",
  "especificar",
  "aluno",
  "alunos",
]);

type TeacherSeed = Omit<TeacherRecord, "scheduleEntries" | "teachingFootprint">;

const SUBJECT_DEFAULT_TAGS: Record<string, string[]> = {
  matematica: ["analise-de-dados", "pensamento-geometrico"],
  ciencias: ["investigacao-cientifica", "sustentabilidade"],
  quimica: ["investigacao-cientifica", "sustentabilidade"],
  geografia: ["sistemas-urbanos", "sustentabilidade"],
  historia: ["cidadania-e-etica", "comunicacao-e-narrativa"],
  ingles: ["comunicacao-e-narrativa"],
  espanhol: ["comunicacao-e-narrativa"],
  "lingua-portuguesa": ["comunicacao-e-narrativa"],
  redacao: ["comunicacao-e-narrativa"],
  "literatura-projetos": ["comunicacao-e-narrativa", "expressao-artistica"],
  "educacao-fisica": ["saude-e-corpo", "cidadania-e-etica"],
  maker: ["prototipagem-digital", "pensamento-computacional"],
  teatro: ["expressao-artistica", "comunicacao-e-narrativa"],
  "maker-teatro": ["prototipagem-digital", "expressao-artistica"],
  artes: ["expressao-artistica", "comunicacao-e-narrativa"],
  musica: ["expressao-artistica"],
  "projeto-de-vida": ["cidadania-e-etica", "comunicacao-e-narrativa"],
  "orientacao-de-estudos": ["cidadania-e-etica"],
  "educacao-financeira": ["analise-de-dados", "cidadania-e-etica"],
};

const PROJECT_TITLES: Record<string, string> = {
  "analise-de-dados+sistemas-urbanos": "Cidade em Dados",
  "analise-de-dados+sustentabilidade": "Painel Vivo do Planeta",
  "sustentabilidade+prototipagem-digital": "Protótipos para um Campus Sustentável",
  "comunicacao-e-narrativa+investigacao-cientifica": "Ciência que se Conta",
  "expressao-artistica+sistemas-urbanos": "Cartografia Sensível da Cidade",
  "pensamento-geometrico+prototipagem-digital": "Geometria que Ganha Forma",
};

export const loadSchoolIntelligenceData = cache(async (): Promise<SchoolIntelligenceDataset> => {
  const schedulePath = await findScheduleFile();

  const [studentRows, teacherRows, scheduleRows, curriculumFiles] = await Promise.all([
    readCsvRows(STUDENTS_FILE),
    readCsvRows(TEACHERS_FILE),
    readCsvRows(schedulePath),
    walkFiles(CURRICULUM_ROOT),
  ]);

  const students = parseStudents(studentRows);
  const teacherSeeds = parseTeachers(teacherRows);
  const parsedSchedule = parseSchedule(scheduleRows);
  const teachers = mergeTeacherSchedules(teacherSeeds, parsedSchedule.teacherEntries);
  const documents = await parseCurriculumDocuments(curriculumFiles);

  const classRecords = buildClasses(parsedSchedule.classEntries, teachers, students, documents);
  const subjects = buildSubjects(teachers, documents, classRecords);
  const connections = buildInterdisciplinaryConnections(subjects, classRecords);
  const projects = buildProjects(connections, subjects);
  const alerts = buildAlerts(teachers, classRecords, subjects, connections, documents);
  const network = buildNetwork(classRecords, teachers, subjects);
  const gradeSummaries = buildGradeSummaries(classRecords, teachers, documents, connections);

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      studentsAvailable: students.some((student) => ["6", "7", "8", "9"].includes(student.gradeKey)),
      scheduleAvailable: parsedSchedule.classEntries.length > 0,
      curriculumAvailable: documents.length > 0,
      note: "Dados nominais de estudantes aparecem apenas em EM 1A-1C. Para os anos finais, o sistema trabalha com alocação docente, horários e currículos.",
    },
    students,
    teachers,
    classes: classRecords,
    subjects,
    documents,
    scheduleEntries: [...parsedSchedule.classEntries, ...parsedSchedule.teacherEntries],
    connections,
    alerts,
    projects,
    network,
    gradeSummaries,
    metrics: {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      totalClasses: classRecords.length,
      totalDocuments: documents.length,
      totalConnections: connections.length,
      totalScheduleEntries: parsedSchedule.classEntries.length + parsedSchedule.teacherEntries.length,
    },
  };
});

async function findScheduleFile() {
  const entries = await fs.readdir(DATA_ROOT);
  const match = entries.find((entry) => entry.startsWith(SCHEDULE_FILE_PREFIX) && entry.endsWith(".csv"));
  if (!match) {
    throw new Error("Arquivo de horário não encontrado.");
  }
  return path.join(DATA_ROOT, match);
}

async function readCsvRows(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const text = iconv.decode(buffer, "win1252");
  return parseCsv(text, {
    delimiter: ";",
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as string[][];
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

function cleanCell(value?: string) {
  return (value ?? "").replace(/\u00a0/g, " ").trim();
}

function parseNumber(value?: string) {
  const normalized = cleanCell(value).replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferGradeFromClassLabel(label: string): GradeKey {
  const normalized = normalizeText(label);
  const match = normalized.match(/\b([6-9])\s?[a-d]?\b/);
  if (match) {
    return match[1] as GradeKey;
  }
  return "other";
}

function classIdFor(campus: "JK" | "ABV" | "multi" | "unknown", classLabel: string) {
  return `${campus.toLowerCase()}-${slugify(classLabel)}`;
}

function resolveSubjectDefinition(raw: string): SubjectDefinition {
  const normalized = normalizeText(raw);
  const compact = normalized.replace(/\s+/g, " ").trim();

  const found =
    SUBJECT_CATALOG.find((subject) =>
      subject.scheduleCodes.some((code) => normalizeText(code) === compact),
    ) ??
    SUBJECT_CATALOG.find((subject) =>
      subject.aliases.some((alias) => compact.includes(normalizeText(alias))),
    ) ??
    SUBJECT_CATALOG.find((subject) => normalizeText(subject.label) === compact);

  if (found) {
    return found;
  }

  const label = raw.replace(/[_-]+/g, " ").trim() || "Componente";
  return {
    id: slugify(label),
    label: titleCase(label),
    shortLabel: titleCase(label).slice(0, 3).toUpperCase(),
    domain: "Interdisciplinar",
    color: "#94a3b8",
    aliases: [compact],
    scheduleCodes: [],
  };
}

function relatedSubjectIds(subjectId: string) {
  const definition = SUBJECT_CATALOG.find((subject) => subject.id === subjectId);
  return unique([subjectId, ...(definition?.relatedSubjectIds ?? [])]);
}

function parseStudents(rows: string[][]): StudentRecord[] {
  const headerLabels = ["Inglês", "IB BUS / IB GP", "IB CHE / IB BIO", "IB MUS / IB SPA"];

  return rows
    .slice(1)
    .map((row) => {
      const classLabel = cleanCell(row[0]);
      const name = cleanCell(row[2]);
      if (!classLabel || !name) {
        return null;
      }

      const assignments: StudentGroupAssignment[] = headerLabels
        .map((label, index) => ({
          label,
          value: cleanCell(row[3 + index]),
        }))
        .filter((assignment) => assignment.value && assignment.value !== "-");

      return {
        id: slugify(`${classLabel}-${name}-${row[7] ?? ""}`),
        name,
        classId: classIdFor("JK", classLabel),
        classLabel,
        campus: "JK",
        gradeKey: inferGradeFromClassLabel(classLabel),
        registry: cleanCell(row[7]),
        email: cleanCell(row[8]) || undefined,
        primaryGroup: assignments.find((assignment) => assignment.value !== "?")?.value,
        groupAssignments: assignments,
      } satisfies StudentRecord;
    })
    .filter(Boolean) as StudentRecord[];
}

function parseTeachers(rows: string[][]): TeacherSeed[] {
  const header = rows[1] ?? [];
  const abvClassHeaders = header.slice(6, 23).map(cleanCell);
  const jkClassHeaders = header.slice(23, 49).map(cleanCell);

  return rows
    .slice(2)
    .map((row) => {
      const name = cleanCell(row[0]);
      if (!name) {
        return null;
      }

      const component = cleanCell(row[1]) || "Componente";
      const subject = resolveSubjectDefinition(component);
      const classLoads: TeacherLoad[] = [];

      abvClassHeaders.forEach((classHeader, index) => {
        const periods = parseNumber(row[6 + index]);
        if (periods > 0 && inferGradeFromClassLabel(classHeader) !== "other") {
          classLoads.push({
            campus: "ABV",
            classId: classIdFor("ABV", classHeader),
            classLabel: classHeader,
            periods,
          });
        }
      });

      jkClassHeaders.forEach((classHeader, index) => {
        const periods = parseNumber(row[23 + index]);
        if (periods > 0 && inferGradeFromClassLabel(classHeader) !== "other") {
          classLoads.push({
            campus: "JK",
            classId: classIdFor("JK", classHeader),
            classLabel: classHeader,
            periods,
          });
        }
      });

      const gradeKeys = unique(
        classLoads
          .map((load) => inferGradeFromClassLabel(load.classLabel))
          .filter((grade): grade is GradeKey => grade !== "other"),
      );

      return {
        id: slugify(name),
        name,
        component,
        subjectId: subject.id,
        subjectLabel: subject.label,
        color: subject.color,
        email: cleanCell(row[49]) || undefined,
        campusLoadTotals: {
          abvAf: parseNumber(row[2]),
          abvEm: parseNumber(row[3]),
          jkAf: parseNumber(row[4]),
          jkEm: parseNumber(row[5]),
        },
        classLoads,
        totalPeriods: sum([parseNumber(row[2]), parseNumber(row[3]), parseNumber(row[4]), parseNumber(row[5])]),
        gradeKeys: subject.id === "maker" ? unique([...gradeKeys, "maker"]) : gradeKeys,
      } satisfies TeacherSeed;
    })
    .filter(Boolean) as TeacherSeed[];
}

function parseSchedule(rows: string[][]) {
  const teacherEntries: ScheduleEntry[] = [];
  const classEntries: ScheduleEntry[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const teacherName = cleanCell(row[0]);
    const classChunk = cleanCell(row[7]);
    const headerCandidate = rows[index + 2]?.[0] ? cleanCell(rows[index + 2]?.[0]) : "";

    if (!teacherName || normalizeText(headerCandidate) !== "horario") {
      continue;
    }

    const classLabel = classChunk.startsWith("Turma")
      ? cleanCell(classChunk.replace(/^Turma\s*/i, ""))
      : "";

    for (let offset = 3; offset <= 13; offset += 1) {
      const slotRow = rows[index + offset] ?? [];
      const slot = cleanCell(slotRow[0]);
      const classSlot = cleanCell(slotRow[8]) || slot;

      if (!slot) {
        continue;
      }

      DAYS.forEach((day, dayIndex) => {
        const teacherValue = cleanCell(slotRow[dayIndex + 1]);
        if (teacherValue && teacherValue !== "---") {
          teacherEntries.push({
            id: slugify(`${teacherName}-${day}-${slot}-${teacherValue}`),
            entityType: "teacher",
            entityId: slugify(teacherName),
            entityLabel: teacherName,
            day,
            dayIndex,
            slot,
            slotIndex: offset - 3,
            label: teacherValue,
            originalCode: teacherValue,
            campus: "JK",
            gradeKey: inferGradeFromClassLabel(teacherValue),
          });
        }
      });

      if (classLabel) {
        DAYS.forEach((day, dayIndex) => {
          const subjectCode = cleanCell(slotRow[9 + dayIndex]);
          if (!subjectCode || subjectCode === "---") {
            return;
          }
          const subject = resolveSubjectDefinition(subjectCode);
          classEntries.push({
            id: slugify(`${classLabel}-${day}-${classSlot}-${subjectCode}`),
            entityType: "class",
            entityId: classIdFor("JK", classLabel),
            entityLabel: classLabel,
            day,
            dayIndex,
            slot: classSlot,
            slotIndex: offset - 3,
            label: subject.label,
            originalCode: subjectCode,
            subjectId: subject.id,
            campus: "JK",
            gradeKey: inferGradeFromClassLabel(classLabel),
          });
        });
      }
    }
  }

  return { teacherEntries, classEntries };
}

function normalizeNameForMatch(name: string) {
  return normalizeText(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teacherMatchScore(a: string, b: string) {
  const normalizedA = normalizeNameForMatch(a);
  const normalizedB = normalizeNameForMatch(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 1;
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 0.86;
  }

  const tokensA = normalizedA.split(" ").filter((token) => token.length > 2);
  const tokensB = normalizedB.split(" ").filter((token) => token.length > 2);
  const shared = tokensA.filter((token) => tokensB.includes(token)).length;
  const overlap = shared / Math.max(tokensA.length, tokensB.length, 1);
  const firstNameBoost = tokensA[0] && tokensA[0] === tokensB[0] ? 0.18 : 0;
  return overlap + firstNameBoost;
}

function mergeTeacherSchedules(teacherSeeds: TeacherSeed[], scheduleEntries: ScheduleEntry[]): TeacherRecord[] {
  const groupedSchedule = groupBy(scheduleEntries, (entry) => entry.entityLabel);
  const records = new Map(
    teacherSeeds.map((teacher) => [
      teacher.id,
      {
        ...teacher,
        scheduleEntries: [] as ScheduleEntry[],
        teachingFootprint: teacher.classLoads.length,
      } satisfies TeacherRecord,
    ]),
  );

  Object.entries(groupedSchedule).forEach(([teacherName, entries]) => {
    let bestMatchId: string | null = null;
    let bestScore = 0;

    records.forEach((teacher, teacherId) => {
      const score = teacherMatchScore(teacher.name, teacherName);
      if (score > bestScore) {
        bestScore = score;
        bestMatchId = teacherId;
      }
    });

    const bestMatch = bestMatchId ? records.get(bestMatchId) : undefined;

    if (bestMatch && bestScore >= 0.52) {
      bestMatch.scheduleEntries.push(
        ...entries.map((entry) => ({
          ...entry,
          entityId: bestMatch.id,
          entityLabel: bestMatch.name,
        })),
      );
      return;
    }

    const fallbackSubject = resolveSubjectDefinition("Componente");
    records.set(slugify(teacherName), {
      id: slugify(teacherName),
      name: teacherName,
      component: "Agenda identificada no horário",
      subjectId: fallbackSubject.id,
      subjectLabel: fallbackSubject.label,
      color: fallbackSubject.color,
      campusLoadTotals: {
        abvAf: 0,
        abvEm: 0,
        jkAf: 0,
        jkEm: 0,
      },
      classLoads: [],
      totalPeriods: entries.length,
      gradeKeys: unique(entries.map((entry) => entry.gradeKey).filter(Boolean)) as GradeKey[],
      scheduleEntries: entries.map((entry) => ({ ...entry, entityId: slugify(teacherName) })),
      teachingFootprint: unique(entries.map((entry) => entry.label)).length,
    });
  });

  records.forEach((teacher) => {
    const scheduledClasses = groupBy(teacher.scheduleEntries, (entry) => entry.label);
    Object.entries(scheduledClasses).forEach(([classLabel, entries]) => {
      const classId = classIdFor("JK", classLabel);
      const alreadyKnown = teacher.classLoads.some((load) => load.classId === classId);
      if (!alreadyKnown && inferGradeFromClassLabel(classLabel) !== "other") {
        teacher.classLoads.push({
          campus: "JK",
          classId,
          classLabel,
          periods: entries.length,
        });
      }
    });

    teacher.gradeKeys = unique(
      [
        ...teacher.gradeKeys,
        ...teacher.classLoads.map((load) => inferGradeFromClassLabel(load.classLabel)),
      ].filter((grade): grade is GradeKey => grade !== "other"),
    );

    if (teacher.subjectId === "maker") {
      teacher.gradeKeys = unique([...teacher.gradeKeys, "maker"]);
    }

    teacher.teachingFootprint =
      unique(teacher.classLoads.map((load) => load.classId)).length +
      unique(teacher.scheduleEntries.map((entry) => `${entry.day}-${entry.slot}`)).length / 10;
  });

  return [...records.values()].sort((a, b) => b.totalPeriods - a.totalPeriods || a.name.localeCompare(b.name));
}

async function parseCurriculumDocuments(files: string[]) {
  const relevantFiles = files.filter((file) =>
    [".docx", ".xlsx", ".pdf"].includes(path.extname(file).toLowerCase()),
  );

  const documents = await Promise.all(
    relevantFiles.map(async (filePath) => {
      const sourceType = path.extname(filePath).toLowerCase().slice(1) as "docx" | "xlsx" | "pdf";
      const relativePath = path.relative(ROOT, filePath).replaceAll("\\", "/");
      const fileName = path.basename(filePath, path.extname(filePath));

      let rawText = "";

      if (sourceType === "docx") {
        const result = await mammoth.extractRawText({ path: filePath });
        rawText = result.value;
      } else if (sourceType === "xlsx") {
        const workbook = XLSX.readFile(filePath, { dense: true });
        rawText = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
            header: 1,
            blankrows: false,
          });
          const preview = rows
            .slice(0, 40)
            .map((row) => row.filter(Boolean).join(" | "))
            .join("\n");
          return `${sheetName}\n${preview}`;
        }).join("\n");
      } else {
        rawText = fileName;
      }

      const cleanedText = rawText
        .replace(/\u00a0/g, " ")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const title =
        cleanedText.split(/\n+/).map(cleanCell).find(Boolean) ??
        titleCase(fileName.replace(/[_-]+/g, " "));
      const subject = resolveSubjectDefinition(`${relativePath} ${title}`);
      const gradeKeys = inferGradeKeys(`${relativePath}\n${title}\n${cleanedText}`, subject.id);
      const tags = extractSharedTags(cleanedText, subject.id);
      const keywords = extractKeywords(cleanedText, tags);
      const sections = extractSections(cleanedText);

      return {
        id: slugify(relativePath),
        title,
        subjectId: subject.id,
        subjectLabel: subject.label,
        gradeKeys,
        sourceType,
        relativePath,
        sections,
        excerpt: cleanedText.slice(0, 280) || title,
        keywords,
        tags,
      } satisfies CurriculumDocument;
    }),
  );

  return documents.sort((a, b) => a.title.localeCompare(b.title));
}

function inferGradeKeys(text: string, subjectId: string): GradeKey[] {
  const normalized = normalizeText(text);
  const grades: GradeKey[] = [];

  (["6", "7", "8", "9"] as GradeKey[]).forEach((grade) => {
    const patterns = [
      new RegExp(`${grade}[ºo°]?\\s*ano`),
      new RegExp(`\\b${grade}\\s?[a-d]\\b`),
      new RegExp(`\\b${grade}[ºo°]_?`),
    ];
    if (patterns.some((pattern) => pattern.test(normalized))) {
      grades.push(grade);
    }
  });

  if (subjectId === "maker" || subjectId === "maker-teatro" || normalized.includes("maker")) {
    grades.push("maker");
  }

  return unique(grades.length ? grades : ["other"]);
}

function extractSections(text: string) {
  const lines = text
    .split(/\n+/)
    .map(cleanCell)
    .filter((line) => line.length > 8 && line.length < 180);

  const highlighted = lines.filter((line) =>
    /(bimestre|cap[ií]tulo|compet[eê]ncias|habilidades|conte[uú]do|objetivos|unidade|tema|bncc|planejamento)/i.test(
      line,
    ),
  );

  return unique((highlighted.length ? highlighted : lines).slice(0, 8));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSharedTags(text: string, subjectId: string) {
  const normalized = normalizeText(text);
  const scores = SHARED_TAGS.map((tag) => {
    const matchedKeywords: string[] = [];
    let score = 0;

    tag.keywords.forEach((keyword) => {
      const keywordPattern = new RegExp(escapeRegExp(normalizeText(keyword)), "g");
      const matches = normalized.match(keywordPattern)?.length ?? 0;
      if (matches > 0) {
        matchedKeywords.push(keyword);
        score += Math.min(matches, 4) * (keyword.includes(" ") ? 1.4 : 1);
      }
    });

    return {
      id: tag.id,
      label: tag.label,
      color: tag.color,
      score,
      matchedKeywords,
    } satisfies SharedTagScore;
  });

  const defaultTags = SUBJECT_DEFAULT_TAGS[subjectId] ?? [];
  defaultTags.forEach((tagId, index) => {
    const target = scores.find((score) => score.id === tagId);
    if (target) {
      target.score += 1.4 - index * 0.2;
    }
  });

  return scores.filter((score) => score.score > 0).sort(byScoreDesc).slice(0, 5);
}

function extractKeywords(text: string, tags: SharedTagScore[]) {
  const frequencies = new Map<string, number>();
  const normalized = normalizeText(text);
  normalized.split(/[^a-z0-9]+/).forEach((token) => {
    if (token.length < 5 || STOP_WORDS.has(token)) {
      return;
    }
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  });

  const frequentKeywords = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([keyword]) => titleCase(keyword));

  return unique([
    ...tags.flatMap((tag) => tag.matchedKeywords.map(titleCase)),
    ...frequentKeywords,
  ]).slice(0, 8);
}

function aggregateTagScores(tagCollections: SharedTagScore[][], limit = 4) {
  const map = new Map<string, SharedTagScore>();

  tagCollections.flat().forEach((tag) => {
    const current = map.get(tag.id);
    if (current) {
      current.score += tag.score;
      current.matchedKeywords = unique([...current.matchedKeywords, ...tag.matchedKeywords]);
    } else {
      map.set(tag.id, { ...tag, matchedKeywords: [...tag.matchedKeywords] });
    }
  });

  return [...map.values()].sort(byScoreDesc).slice(0, limit);
}

function buildClasses(
  classEntries: ScheduleEntry[],
  teachers: TeacherRecord[],
  students: StudentRecord[],
  documents: CurriculumDocument[],
) {
  const groupedSchedule = groupBy(classEntries, (entry) => entry.entityId);
  const groupedStudents = groupBy(students, (student) => student.classId);

  return Object.entries(groupedSchedule)
    .map(([classId, entries]) => {
      const classLabel = entries[0]?.entityLabel ?? classId;
      const gradeKey = inferGradeFromClassLabel(classLabel);
      const scheduleByDay = groupBy(entries, (entry) => entry.day);
      const subjectLoadsMap = new Map<string, ClassRecord["subjectLoads"][number]>();

      entries.forEach((entry) => {
        const subject = resolveSubjectDefinition(entry.subjectId ?? entry.label);
        const existing = subjectLoadsMap.get(subject.id);
        if (existing) {
          existing.sessions += 1;
        } else {
          subjectLoadsMap.set(subject.id, {
            subjectId: subject.id,
            subjectLabel: subject.label,
            color: subject.color,
            sessions: 1,
          });
        }
      });

      const subjectIds = [...subjectLoadsMap.values()].flatMap((load) => relatedSubjectIds(load.subjectId));
      const relevantDocuments = documents.filter(
        (document) =>
          document.gradeKeys.includes(gradeKey) &&
          document.tags.length > 0 &&
          (subjectIds.includes(document.subjectId) ||
            relatedSubjectIds(document.subjectId).some((subjectId) => subjectIds.includes(subjectId))),
      );

      const classTeachers = teachers.filter((teacher) =>
        teacher.classLoads.some((load) => load.classId === classId) ||
        teacher.scheduleEntries.some((entry) => entry.label === classLabel),
      );

      const dailyLoads = Object.entries(scheduleByDay).map(([day, dayEntries]) => ({
        day,
        sessions: dayEntries.length,
      }));
      const busiestDay = dailyLoads.sort((a, b) => b.sessions - a.sessions)[0]?.day ?? "Seg";
      const classStudents = groupedStudents[classId] ?? [];

      return {
        id: classId,
        label: classLabel,
        gradeKey,
        campus: entries[0]?.campus ?? "JK",
        teacherIds: unique(classTeachers.map((teacher) => teacher.id)),
        studentIds: classStudents.map((student) => student.id),
        weeklyLoad: entries.length,
        averageDailyLoad: average(dailyLoads.map((item) => item.sessions)),
        busiestDay,
        subjectLoads: [...subjectLoadsMap.values()].sort((a, b) => b.sessions - a.sessions),
        tags: aggregateTagScores(relevantDocuments.map((document) => document.tags), 4),
        documents: relevantDocuments.map((document) => document.id),
        scheduleEntries: entries,
      } satisfies ClassRecord;
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function buildSubjects(
  teachers: TeacherRecord[],
  documents: CurriculumDocument[],
  classes: ClassRecord[],
) {
  const subjects = new Map<string, SubjectRecord>();

  const ensureSubject = (subjectId: string, fallbackLabel?: string) => {
    const definition = resolveSubjectDefinition(fallbackLabel ?? subjectId);
    if (!subjects.has(subjectId)) {
      subjects.set(subjectId, {
        id: subjectId,
        label: definition.label,
        shortLabel: definition.shortLabel,
        color: definition.color,
        domain: definition.domain,
        grades: [],
        classIds: [],
        teacherIds: [],
        documentIds: [],
        tags: [],
        scheduleCodes: definition.scheduleCodes,
      });
    }
    return subjects.get(subjectId)!;
  };

  teachers.forEach((teacher) => {
    const subject = ensureSubject(teacher.subjectId, teacher.subjectLabel);
    subject.teacherIds.push(teacher.id);
    subject.classIds.push(...teacher.classLoads.filter((load) => load.campus === "JK").map((load) => load.classId));
    subject.grades.push(...teacher.gradeKeys);
  });

  documents.forEach((document) => {
    const subject = ensureSubject(document.subjectId, document.subjectLabel);
    subject.documentIds.push(document.id);
    subject.grades.push(...document.gradeKeys);
    subject.tags = aggregateTagScores([subject.tags, document.tags], 5);
  });

  classes.forEach((classRecord) => {
    classRecord.subjectLoads.forEach((load) => {
      const subject = ensureSubject(load.subjectId, load.subjectLabel);
      subject.classIds.push(classRecord.id);
      subject.grades.push(classRecord.gradeKey);
      subject.tags = aggregateTagScores([subject.tags, classRecord.tags], 5);
    });
  });

  return [...subjects.values()]
    .map((subject) => ({
      ...subject,
      grades: unique(subject.grades.filter((grade): grade is GradeKey => Boolean(grade))),
      classIds: unique(subject.classIds),
      teacherIds: unique(subject.teacherIds),
      documentIds: unique(subject.documentIds),
      tags: aggregateTagScores([subject.tags], 5),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function buildInterdisciplinaryConnections(subjects: SubjectRecord[], classes: ClassRecord[]) {
  const connections: InterdisciplinaryConnection[] = [];

  for (let index = 0; index < subjects.length; index += 1) {
    for (let inner = index + 1; inner < subjects.length; inner += 1) {
      const source = subjects[index];
      const target = subjects[inner];

      if (!source.grades.some((grade) => target.grades.includes(grade))) {
        continue;
      }

      const sharedTagMap = new Map<string, SharedTagScore>();
      source.tags.forEach((sourceTag) => {
        const targetTag = target.tags.find((tag) => tag.id === sourceTag.id);
        if (targetTag) {
          sharedTagMap.set(sourceTag.id, {
            ...sourceTag,
            score: sourceTag.score + targetTag.score,
            matchedKeywords: unique([...sourceTag.matchedKeywords, ...targetTag.matchedKeywords]),
          });
        }
      });

      let score = sum([...sharedTagMap.values()].map((tag) => tag.score));
      let hiddenOpportunity = false;

      SHARED_TAGS.forEach((tag) => {
        const sourceHas = source.tags.some((item) => item.id === tag.id);
        const targetComplement = tag.complementary.some((relatedTag) => target.tags.some((item) => item.id === relatedTag));
        if (sourceHas && targetComplement) {
          score += 1.4;
          hiddenOpportunity = true;
        }
      });

      if (score < 4.2) {
        continue;
      }

      const sharedTags = [...sharedTagMap.values()].sort(byScoreDesc).slice(0, 3);
      const gradeKeys = unique(source.grades.filter((grade) => target.grades.includes(grade)));
      const strength = connectionStrength(score);
      const sharedTagLabels = sharedTags.map((tag) => tag.label);

      connections.push({
        id: slugify(`${source.id}-${target.id}`),
        sourceId: source.id,
        sourceType: "subject",
        targetId: target.id,
        targetType: "subject",
        sharedTags,
        score,
        strength,
        rationale:
          sharedTags.length > 0
            ? `${source.label} e ${target.label} compartilham ${sharedTagLabels.join(", ")}.`
            : `${source.label} e ${target.label} sugerem uma conexão complementar ainda pouco explorada.`,
        opportunity: buildOpportunityCopy(source, target, sharedTags, gradeKeys, classes),
        gradeKeys,
        hiddenOpportunity,
      });
    }
  }

  return connections.sort((a, b) => b.score - a.score);
}

function connectionStrength(score: number): ConnectionStrength {
  if (score >= 12) return "strong";
  if (score >= 7) return "medium";
  return "weak";
}

function buildOpportunityCopy(
  source: SubjectRecord,
  target: SubjectRecord,
  sharedTags: SharedTagScore[],
  gradeKeys: GradeKey[],
  classes: ClassRecord[],
) {
  const commonClasses = classes.filter(
    (classRecord) =>
      gradeKeys.includes(classRecord.gradeKey) &&
      classRecord.subjectLoads.some((load) => relatedSubjectIds(load.subjectId).includes(source.id)) &&
      classRecord.subjectLoads.some((load) => relatedSubjectIds(load.subjectId).includes(target.id)),
  );

  const classHint = commonClasses[0]?.label
    ? `Pode nascer de imediato em ${commonClasses[0].label}.`
    : `Há espaço para um piloto nos anos ${gradeKeys.map(formatGradeLabel).join(", ")}.`;

  if (sharedTags[0]) {
    return `Criar uma trilha comum de ${sharedTags[0].label.toLowerCase()} com ${source.label} e ${target.label}. ${classHint}`;
  }

  return `Conectar ${source.label} e ${target.label} em um projeto orientado por problema real. ${classHint}`;
}

function buildProjects(connections: InterdisciplinaryConnection[], subjects: SubjectRecord[]) {
  return connections
    .slice(0, 12)
    .map((connection) => {
      const source = subjects.find((subject) => subject.id === connection.sourceId);
      const target = subjects.find((subject) => subject.id === connection.targetId);
      if (!source || !target) {
        return null;
      }

      const primaryTagIds = connection.sharedTags.slice(0, 2).map((tag) => tag.id).sort();
      const titleKey = primaryTagIds.join("+");
      const title =
        PROJECT_TITLES[titleKey] ??
        `Projeto integrador: ${source.label} + ${target.label}`;

      const summary =
        connection.sharedTags.length > 0
          ? `${source.label} entra com repertório disciplinar e ${target.label} amplia a aplicação em ${connection.sharedTags
              .map((tag) => tag.label)
              .join(", ")}.`
          : `${source.label} e ${target.label} podem abrir uma frente nova de aprendizagem baseada em projeto.`;

      return {
        id: slugify(`${connection.id}-${title}`),
        title,
        summary,
        subjects: [source.label, target.label],
        classIds: [],
        tags: connection.sharedTags.map((tag) => tag.label),
        strength: connection.strength,
        gradeKeys: connection.gradeKeys,
      } satisfies ProjectSuggestion;
    })
    .filter(Boolean) as ProjectSuggestion[];
}

function buildAlerts(
  teachers: TeacherRecord[],
  classes: ClassRecord[],
  subjects: SubjectRecord[],
  connections: InterdisciplinaryConnection[],
  documents: CurriculumDocument[],
) {
  const alerts: InsightAlert[] = [];
  const sortedTeachers = [...teachers].sort((a, b) => b.totalPeriods - a.totalPeriods);
  const overloadThreshold = sortedTeachers[Math.min(3, sortedTeachers.length - 1)]?.totalPeriods ?? 0;

  sortedTeachers
    .filter((teacher) => teacher.totalPeriods >= overloadThreshold && teacher.totalPeriods > 14)
    .slice(0, 4)
    .forEach((teacher) => {
      alerts.push({
        id: slugify(`teacher-overload-${teacher.id}`),
        severity: "high",
        title: `${teacher.name} concentra carga elevada`,
        description: `${teacher.subjectLabel} soma ${teacher.totalPeriods} aulas e circula por ${unique(teacher.classLoads.map((load) => load.classLabel)).length} turmas.`,
        relatedIds: [teacher.id],
        relatedType: "teacher",
        gradeKeys: teacher.gradeKeys,
      });
    });

  const classMedian = average(classes.map((classRecord) => classRecord.weeklyLoad));
  classes
    .filter((classRecord) => Math.abs(classRecord.weeklyLoad - classMedian) >= 3)
    .slice(0, 4)
    .forEach((classRecord) => {
      alerts.push({
        id: slugify(`class-load-${classRecord.id}`),
        severity: "medium",
        title: `${classRecord.label} foge do padrão de carga`,
        description: `${classRecord.label} soma ${classRecord.weeklyLoad} blocos semanais, com pico em ${classRecord.busiestDay}.`,
        relatedIds: [classRecord.id],
        relatedType: "class",
        gradeKeys: [classRecord.gradeKey],
      });
    });

  const isolatedSubjects = subjects.filter(
    (subject) => !connections.some((connection) => connection.sourceId === subject.id || connection.targetId === subject.id),
  );

  isolatedSubjects.slice(0, 4).forEach((subject) => {
    alerts.push({
      id: slugify(`subject-gap-${subject.id}`),
      severity: "medium",
      title: `${subject.label} aparece isolado no mapa`,
      description: "Há poucas pontes curriculares explícitas. Vale buscar temas-problema compartilhados com outras áreas.",
      relatedIds: [subject.id],
      relatedType: "subject",
      gradeKeys: subject.grades,
    });
  });

  if (!classes.some((classRecord) => ["6", "7", "8", "9"].includes(classRecord.gradeKey) && classRecord.studentIds.length > 0)) {
    alerts.push({
      id: "student-coverage-gap",
      severity: "info",
      title: "Dados nominais de estudantes não aparecem nos anos finais",
      description: "A leitura individual foi desenhada para se adaptar, mas hoje ela depende de turmas de EM 1A-1C.",
      relatedIds: [],
      relatedType: "system",
      gradeKeys: ["6", "7", "8", "9"],
    });
  }

  const gradeDocumentCounts = groupBy(
    documents.flatMap((document) => document.gradeKeys.map((gradeKey) => ({ gradeKey, documentId: document.id }))),
    (item) => item.gradeKey,
  );

  (["6", "7", "8", "9"] as GradeKey[]).forEach((grade) => {
    const count = gradeDocumentCounts[grade]?.length ?? 0;
    if (count < 3) {
      alerts.push({
        id: `curriculum-gap-${grade}`,
        severity: "info",
        title: `${formatGradeLabel(grade)} com trilha curricular mais enxuta`,
        description: `Só ${count} documentos estruturados foram encontrados para esta série, o que reduz o poder de descoberta interdisciplinar.`,
        relatedIds: [],
        relatedType: "system",
        gradeKeys: [grade],
      });
    }
  });

  return alerts.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function severityWeight(severity: InsightAlert["severity"]) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function buildNetwork(classes: ClassRecord[], teachers: TeacherRecord[], subjects: SubjectRecord[]) {
  const topicPool = aggregateTagScores(
    [...subjects.map((subject) => subject.tags), ...classes.map((classRecord) => classRecord.tags)],
    12,
  );

  const topicNodes: NetworkNode[] = topicPool.map((tag) => ({
    id: tag.id,
    kind: "topic",
    label: tag.label,
    shortLabel: tag.label.split(" ")[0],
    color: tag.color,
    strength: tag.score,
    gradeKeys: ["all"],
    detail: tag.label,
  }));

  const classNodes: NetworkNode[] = classes.map((classRecord) => ({
    id: classRecord.id,
    kind: "class",
    label: classRecord.label,
    shortLabel: classRecord.label,
    color: "#e2e8f0",
    strength: classRecord.weeklyLoad,
    gradeKeys: [classRecord.gradeKey],
    detail: `${classRecord.weeklyLoad} blocos semanais`,
  }));

  const subjectNodes: NetworkNode[] = subjects.map((subject) => ({
    id: subject.id,
    kind: "subject",
    label: subject.label,
    shortLabel: subject.shortLabel,
    color: subject.color,
    strength: subject.tags.reduce((total, tag) => total + tag.score, 0) || 4,
    gradeKeys: subject.grades,
    detail: subject.domain,
  }));

  const teacherNodes: NetworkNode[] = teachers
    .filter((teacher) => teacher.classLoads.some((load) => load.campus === "JK"))
    .map((teacher) => ({
      id: teacher.id,
      kind: "teacher",
      label: teacher.name,
      shortLabel: teacher.name.split(" ")[0] ?? teacher.name,
      color: teacher.color,
      strength: teacher.totalPeriods,
      gradeKeys: teacher.gradeKeys,
      detail: teacher.subjectLabel,
    }));

  const links: NetworkLink[] = [];

  classes.forEach((classRecord) => {
    classRecord.subjectLoads.forEach((load) => {
      const subject = subjects.find((item) => item.id === load.subjectId);
      if (!subject) return;
      links.push({
        id: slugify(`${classRecord.id}-${subject.id}`),
        source: classRecord.id,
        target: subject.id,
        color: subject.color,
        strength: load.sessions,
        gradeKeys: [classRecord.gradeKey],
        detail: `${classRecord.label} recebe ${load.sessions} blocos de ${subject.label}.`,
      });
    });
  });

  teachers.forEach((teacher) => {
    if (teacher.classLoads.some((load) => load.campus === "JK")) {
      links.push({
        id: slugify(`${teacher.id}-${teacher.subjectId}`),
        source: teacher.id,
        target: teacher.subjectId,
        color: teacher.color,
        strength: teacher.totalPeriods,
        gradeKeys: teacher.gradeKeys,
        detail: `${teacher.name} puxa ${teacher.subjectLabel}.`,
      });
    }

    teacher.classLoads
      .filter((load) => load.campus === "JK")
      .forEach((load) => {
        links.push({
          id: slugify(`${teacher.id}-${load.classId}`),
          source: teacher.id,
          target: load.classId,
          color: teacher.color,
          strength: load.periods,
          gradeKeys: [inferGradeFromClassLabel(load.classLabel)],
          detail: `${teacher.name} atende ${load.classLabel} em ${load.periods} blocos.`,
        });
      });
  });

  subjects.forEach((subject) => {
    subject.tags.slice(0, 3).forEach((tag) => {
      if (!topicNodes.some((topic) => topic.id === tag.id)) return;
      links.push({
        id: slugify(`${subject.id}-${tag.id}`),
        source: subject.id,
        target: tag.id,
        color: tag.color,
        strength: tag.score,
        gradeKeys: subject.grades,
        detail: `${subject.label} aciona ${tag.label}.`,
      });
    });
  });

  return {
    nodes: [...classNodes, ...subjectNodes, ...teacherNodes, ...topicNodes],
    links,
  };
}

function buildGradeSummaries(
  classes: ClassRecord[],
  teachers: TeacherRecord[],
  documents: CurriculumDocument[],
  connections: InterdisciplinaryConnection[],
) {
  return GRADE_OPTIONS.filter((option) => option.id !== "all").map((option) => {
    const classCount =
      option.id === "maker"
        ? classes.filter((classRecord) => classRecord.subjectLoads.some((load) => relatedSubjectIds(load.subjectId).includes("maker"))).length
        : classes.filter((classRecord) => classRecord.gradeKey === option.id).length;

    const teacherCount =
      option.id === "maker"
        ? teachers.filter((teacher) => teacher.subjectId === "maker" || teacher.subjectId === "maker-teatro").length
        : teachers.filter((teacher) => teacher.gradeKeys.includes(option.id)).length;

    const curriculumCount = documents.filter((document) => document.gradeKeys.includes(option.id)).length;
    const connectionCount = connections.filter((connection) => connection.gradeKeys.includes(option.id)).length;
    const topTags = aggregateTagScores(
      documents.filter((document) => document.gradeKeys.includes(option.id)).map((document) => document.tags),
      3,
    );

    return {
      gradeKey: option.id,
      label: option.label,
      classCount,
      teacherCount,
      curriculumCount,
      connectionCount,
      topTags,
      coverage: {
        studentsAvailable: classes.some(
          (classRecord) => classRecord.gradeKey === option.id && classRecord.studentIds.length > 0,
        ),
        scheduleAvailable:
          option.id === "maker"
            ? classes.some((classRecord) => classRecord.subjectLoads.some((load) => load.subjectId === "maker" || load.subjectId === "maker-teatro"))
            : classes.some((classRecord) => classRecord.gradeKey === option.id),
        curriculumAvailable: curriculumCount > 0,
        note:
          option.id === "maker"
            ? "Maker aparece como trilha transversal conectando séries e competências digitais."
            : `Visão consolidada de ${option.label} construída a partir de horários, docentes e documentos curriculares.`,
      },
    } satisfies GradeSummary;
  });
}
