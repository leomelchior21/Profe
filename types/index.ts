export type GradeKey = "all" | "6" | "7" | "8" | "9" | "maker" | "other";

export type ViewMode =
  | "overview"
  | "students"
  | "classes"
  | "teachers"
  | "schedule"
  | "insights"
  | "interdisciplinary";

export type Severity = "critical" | "high" | "medium" | "info";
export type ConnectionStrength = "strong" | "medium" | "weak";
export type NodeKind = "class" | "subject" | "teacher" | "topic";
export type CampusKey = "JK" | "ABV" | "multi" | "unknown";

export interface GradeOption {
  id: GradeKey;
  label: string;
  shortLabel: string;
  accent: string;
}

export interface ViewOption {
  id: ViewMode;
  label: string;
  helper: string;
}

export interface StudentGroupAssignment {
  label: string;
  value: string;
}

export interface StudentRecord {
  id: string;
  name: string;
  classId: string;
  classLabel: string;
  campus: CampusKey;
  gradeKey: GradeKey;
  registry?: string;
  email?: string;
  primaryGroup?: string;
  groupAssignments: StudentGroupAssignment[];
}

export interface ScheduleEntry {
  id: string;
  entityType: "teacher" | "class";
  entityId: string;
  entityLabel: string;
  day: string;
  dayIndex: number;
  slot: string;
  slotIndex: number;
  label: string;
  subjectId?: string;
  originalCode?: string;
  campus: CampusKey;
  gradeKey?: GradeKey;
}

export interface SharedTagDefinition {
  id: string;
  label: string;
  description: string;
  color: string;
  keywords: string[];
  complementary: string[];
}

export interface SharedTagScore {
  id: string;
  label: string;
  color: string;
  score: number;
  matchedKeywords: string[];
}

export interface CurriculumDocument {
  id: string;
  title: string;
  subjectId: string;
  subjectLabel: string;
  gradeKeys: GradeKey[];
  sourceType: "docx" | "xlsx" | "pdf";
  relativePath: string;
  sections: string[];
  excerpt: string;
  keywords: string[];
  tags: SharedTagScore[];
}

export interface SubjectRecord {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  domain: string;
  grades: GradeKey[];
  classIds: string[];
  teacherIds: string[];
  documentIds: string[];
  tags: SharedTagScore[];
  scheduleCodes: string[];
}

export interface TeacherLoad {
  campus: CampusKey;
  classId: string;
  classLabel: string;
  periods: number;
}

export interface TeacherRecord {
  id: string;
  name: string;
  component: string;
  subjectId: string;
  subjectLabel: string;
  color: string;
  email?: string;
  campusLoadTotals: {
    abvAf: number;
    abvEm: number;
    jkAf: number;
    jkEm: number;
  };
  classLoads: TeacherLoad[];
  scheduleEntries: ScheduleEntry[];
  totalPeriods: number;
  teachingFootprint: number;
  gradeKeys: GradeKey[];
}

export interface ClassSubjectLoad {
  subjectId: string;
  subjectLabel: string;
  color: string;
  sessions: number;
}

export interface ClassRecord {
  id: string;
  label: string;
  gradeKey: GradeKey;
  campus: CampusKey;
  teacherIds: string[];
  studentIds: string[];
  weeklyLoad: number;
  averageDailyLoad: number;
  busiestDay: string;
  subjectLoads: ClassSubjectLoad[];
  tags: SharedTagScore[];
  documents: string[];
  scheduleEntries: ScheduleEntry[];
}

export interface InterdisciplinaryConnection {
  id: string;
  sourceId: string;
  sourceType: NodeKind;
  targetId: string;
  targetType: NodeKind;
  sharedTags: SharedTagScore[];
  score: number;
  strength: ConnectionStrength;
  rationale: string;
  opportunity: string;
  gradeKeys: GradeKey[];
  hiddenOpportunity?: boolean;
}

export interface InsightAlert {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  relatedIds: string[];
  relatedType: NodeKind | "system";
  gradeKeys: GradeKey[];
}

export interface ProjectSuggestion {
  id: string;
  title: string;
  summary: string;
  subjects: string[];
  classIds: string[];
  tags: string[];
  strength: ConnectionStrength;
  gradeKeys: GradeKey[];
}

export interface NetworkNode {
  id: string;
  kind: NodeKind;
  label: string;
  shortLabel: string;
  color: string;
  strength: number;
  gradeKeys: GradeKey[];
  detail: string;
}

export interface NetworkLink {
  id: string;
  source: string;
  target: string;
  color: string;
  strength: number;
  gradeKeys: GradeKey[];
  detail: string;
}

export interface CoverageSummary {
  studentsAvailable: boolean;
  scheduleAvailable: boolean;
  curriculumAvailable: boolean;
  note: string;
}

export interface GradeSummary {
  gradeKey: GradeKey;
  label: string;
  classCount: number;
  teacherCount: number;
  curriculumCount: number;
  connectionCount: number;
  topTags: SharedTagScore[];
  coverage: CoverageSummary;
}

export interface SchoolIntelligenceDataset {
  generatedAt: string;
  coverage: CoverageSummary;
  students: StudentRecord[];
  teachers: TeacherRecord[];
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  documents: CurriculumDocument[];
  scheduleEntries: ScheduleEntry[];
  connections: InterdisciplinaryConnection[];
  alerts: InsightAlert[];
  projects: ProjectSuggestion[];
  network: {
    nodes: NetworkNode[];
    links: NetworkLink[];
  };
  gradeSummaries: GradeSummary[];
  metrics: {
    totalStudents: number;
    totalTeachers: number;
    totalClasses: number;
    totalDocuments: number;
    totalConnections: number;
    totalScheduleEntries: number;
  };
}

export interface SelectedEntity {
  type: "student" | "teacher" | "class" | "subject";
  id: string;
}

export interface DashboardLensData {
  grade: GradeKey;
  summary?: GradeSummary;
  students: StudentRecord[];
  teachers: TeacherRecord[];
  classes: ClassRecord[];
  subjects: SubjectRecord[];
  documents: CurriculumDocument[];
  connections: InterdisciplinaryConnection[];
  alerts: InsightAlert[];
  projects: ProjectSuggestion[];
  network: {
    nodes: NetworkNode[];
    links: NetworkLink[];
  };
}
