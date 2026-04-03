"use client";

import { startTransition, useState, type ReactNode } from "react";

import {
  AlertTriangle,
  CalendarClock,
  FileText,
  GraduationCap,
  Layers3,
  Link2,
  Network,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { NetworkGraph } from "@/components/network-graph";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DAYS, GRADE_OPTIONS, TIME_SLOTS, VIEW_OPTIONS } from "@/lib/taxonomy";
import {
  cn,
  compactNumber,
  formatGradeLabel,
  formatStrength,
  pickTopTags,
} from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboard-store";
import type {
  DashboardLensData,
  InsightAlert,
  SchoolIntelligenceDataset,
  SelectedEntity,
  SharedTagScore,
  ViewMode,
} from "@/types";

const MODE_ICONS: Record<ViewMode, LucideIcon> = {
  overview: FileText,
  students: Users,
  classes: Layers3,
  teachers: GraduationCap,
  schedule: CalendarClock,
  insights: AlertTriangle,
  interdisciplinary: Network,
};

interface ResolvedEntity {
  kind: string;
  title: string;
  subtitle: string;
  metrics: { label: string; value: string }[];
  details: { label: string; value: string }[];
  tags: SharedTagScore[];
}

export function DashboardApp({ data }: { data: SchoolIntelligenceDataset }) {
  const {
    activeGrade,
    activeMode,
    selectedEntity,
    setActiveGrade,
    setActiveMode,
    setSelectedEntity,
  } = useDashboardStore();

  const lens = buildLensData(data, activeGrade);
  const selection = resolveSelectedEntity(data, selectedEntity);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6 lg:py-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <SidebarPanel
          activeGrade={activeGrade}
          activeMode={activeMode}
          lens={lens}
          onClearSelection={() => setSelectedEntity(null)}
          onGradeChange={(grade) => startTransition(() => setActiveGrade(grade))}
          onModeChange={(mode) => startTransition(() => setActiveMode(mode))}
          selection={selection}
        />

        <main className="min-w-0 space-y-6">
          <ReportHeader generatedAt={data.generatedAt} lens={lens} mode={activeMode} />
          <SceneRenderer lens={lens} mode={activeMode} onSelectEntity={setSelectedEntity} />
        </main>
      </div>
    </div>
  );
}

function buildLensData(data: SchoolIntelligenceDataset, grade: DashboardLensData["grade"]): DashboardLensData {
  const gradeSummary = data.gradeSummaries.find((summary) => summary.gradeKey === grade);
  const classes =
    grade === "all"
      ? data.classes
      : grade === "maker"
        ? data.classes.filter((classRecord) =>
            classRecord.subjectLoads.some((load) => load.subjectId === "maker" || load.subjectId === "maker-teatro"),
          )
        : data.classes.filter((classRecord) => classRecord.gradeKey === grade);

  const classIds = new Set(classes.map((classRecord) => classRecord.id));
  const teachers =
    grade === "all"
      ? data.teachers
      : grade === "maker"
        ? data.teachers.filter(
            (teacher) =>
              teacher.subjectId === "maker" ||
              teacher.subjectId === "maker-teatro" ||
              teacher.classLoads.some((load) => classIds.has(load.classId)),
          )
        : data.teachers.filter(
            (teacher) =>
              teacher.gradeKeys.includes(grade) || teacher.classLoads.some((load) => classIds.has(load.classId)),
          );

  const subjects =
    grade === "all"
      ? data.subjects
      : grade === "maker"
        ? data.subjects.filter(
            (subject) =>
              subject.id === "maker" ||
              subject.id === "maker-teatro" ||
              subject.classIds.some((classId) => classIds.has(classId)),
          )
        : data.subjects.filter(
            (subject) => subject.grades.includes(grade) || subject.classIds.some((classId) => classIds.has(classId)),
          );

  const documents =
    grade === "all"
      ? data.documents
      : data.documents.filter((document) => document.gradeKeys.includes(grade));

  const connections =
    grade === "all"
      ? data.connections
      : data.connections.filter((connection) => connection.gradeKeys.includes(grade));

  const alerts =
    grade === "all"
      ? data.alerts
      : data.alerts.filter((alert) => alert.gradeKeys.length === 0 || alert.gradeKeys.includes(grade));

  const projects =
    grade === "all"
      ? data.projects
      : data.projects.filter((project) => project.gradeKeys.includes(grade));

  const students =
    grade === "all"
      ? data.students
      : data.students.filter((student) => student.gradeKey === grade);

  const network =
    grade === "all" ? data.network : filterNetwork(data.network, grade, classes, teachers, subjects);

  return {
    grade,
    summary: gradeSummary,
    students,
    teachers,
    classes,
    subjects,
    documents,
    connections,
    alerts,
    projects,
    network,
  };
}

function filterNetwork(
  network: SchoolIntelligenceDataset["network"],
  grade: DashboardLensData["grade"],
  classes: DashboardLensData["classes"],
  teachers: DashboardLensData["teachers"],
  subjects: DashboardLensData["subjects"],
) {
  const visibleIds = new Set([
    ...classes.map((classRecord) => classRecord.id),
    ...teachers.map((teacher) => teacher.id),
    ...subjects.map((subject) => subject.id),
  ]);

  const links = network.links.filter((link) => {
    if (grade === "maker") {
      return visibleIds.has(link.source) || visibleIds.has(link.target);
    }
    return link.gradeKeys.includes(grade) || link.gradeKeys.includes("all");
  });

  const linkedIds = new Set<string>();
  links.forEach((link) => {
    linkedIds.add(link.source);
    linkedIds.add(link.target);
  });

  const nodes = network.nodes.filter((node) => {
    if (grade === "maker") {
      return visibleIds.has(node.id) || linkedIds.has(node.id);
    }
    return node.gradeKeys.includes(grade) || node.gradeKeys.includes("all") || linkedIds.has(node.id);
  });

  return { nodes, links };
}

function SidebarPanel({
  activeGrade,
  activeMode,
  lens,
  selection,
  onGradeChange,
  onModeChange,
  onClearSelection,
}: {
  activeGrade: DashboardLensData["grade"];
  activeMode: ViewMode;
  lens: DashboardLensData;
  selection: ResolvedEntity | null;
  onGradeChange: (grade: DashboardLensData["grade"]) => void;
  onModeChange: (mode: ViewMode) => void;
  onClearSelection: () => void;
}) {
  const topTags = aggregateTags([
    ...(lens.summary?.topTags ?? []),
    ...lens.subjects.flatMap((subject) => subject.tags),
    ...lens.documents.flatMap((document) => document.tags),
  ]).slice(0, 5);

  return (
    <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
      <div className="panel-shell custom-scroll flex h-full flex-col gap-5 overflow-y-auto p-4 md:p-5">
        <div className="space-y-3">
          <Badge>School report</Badge>
          <div>
            <h1 className="font-display text-3xl text-white">Pedagogical Report</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Simpler, scrollable, and focused on the decisions you need to make quickly.
            </p>
          </div>
        </div>

        <SidebarBlock label="Scope">
          <div className="grid grid-cols-3 gap-2">
            {GRADE_OPTIONS.map((grade) => (
              <button
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left transition",
                  activeGrade === grade.id
                    ? "border-sky-300/35 bg-sky-300/12 text-white"
                    : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                )}
                key={grade.id}
                onClick={() => onGradeChange(grade.id)}
                type="button"
              >
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{grade.shortLabel}</div>
                <div className="mt-2 font-medium">{grade.label}</div>
              </button>
            ))}
          </div>
        </SidebarBlock>

        <SidebarBlock label="Sections">
          <div className="space-y-2">
            {VIEW_OPTIONS.map((view) => {
              const Icon = MODE_ICONS[view.id];
              return (
                <button
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
                    activeMode === view.id
                      ? "border-white/14 bg-white/[0.08] text-white"
                      : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                  )}
                  key={view.id}
                  onClick={() => onModeChange(view.id)}
                  type="button"
                >
                  <Icon className="mt-0.5 size-4 text-sky-300" />
                  <div className="min-w-0">
                    <div className="font-medium">{view.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{view.helper}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </SidebarBlock>

        <SidebarBlock label="Quick read">
          <div className="grid grid-cols-2 gap-2">
            <SidebarMetric label="Classes" value={`${lens.classes.length}`} />
            <SidebarMetric label="Teachers" value={`${lens.teachers.length}`} />
            <SidebarMetric label="Docs" value={`${lens.documents.length}`} />
            <SidebarMetric label="Alerts" value={`${lens.alerts.length}`} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {lens.summary?.coverage.note ??
              "This view combines schedules, teachers, curriculum documents, and generated findings."}
          </p>
        </SidebarBlock>

        <SidebarBlock label="Current selection">
          {selection ? (
            <SelectionCard onClearSelection={onClearSelection} selection={selection} />
          ) : (
            <Card className="rounded-2xl border-dashed p-4">
              <p className="text-sm leading-6 text-slate-300">
                Click any class, teacher, subject, or student card to keep its details pinned here.
              </p>
            </Card>
          )}
        </SidebarBlock>

        <SidebarBlock label="Top findings">
          <div className="space-y-2">
            {lens.alerts.slice(0, 3).map((alert) => (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3" key={alert.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{alert.title}</p>
                  <Badge className={severityClass(alert.severity)}>{severityLabel(alert.severity)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{alert.description}</p>
              </div>
            ))}
            {lens.alerts.length === 0 ? (
              <Card className="rounded-2xl p-4">
                <p className="text-sm leading-6 text-slate-300">No alert rules were triggered for this scope.</p>
              </Card>
            ) : null}
          </div>
        </SidebarBlock>

        <SidebarBlock label="Recurring themes">
          <div className="flex flex-wrap gap-2">
            {topTags.map((tag) => (
              <TagChip color={tag.color} key={tag.id} label={tag.label} />
            ))}
            {topTags.length === 0 ? (
              <p className="text-sm leading-6 text-slate-300">No recurring tags were identified in this scope.</p>
            ) : null}
          </div>
        </SidebarBlock>
      </div>
    </aside>
  );
}

function SelectionCard({
  selection,
  onClearSelection,
}: {
  selection: ResolvedEntity;
  onClearSelection: () => void;
}) {
  return (
    <Card className="rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{selection.kind}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{selection.title}</h3>
          <p className="mt-1 text-sm text-slate-300">{selection.subtitle}</p>
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/[0.05] p-2 text-slate-300 transition hover:bg-white/[0.1] hover:text-white"
          onClick={onClearSelection}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {selection.metrics.map((metric) => (
          <SidebarMetric key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {selection.details.slice(0, 3).map((detail) => (
          <div className="rounded-xl border border-white/8 bg-black/10 p-3" key={detail.label}>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{detail.label}</div>
            <div className="mt-1 text-sm leading-6 text-slate-200">{detail.value}</div>
          </div>
        ))}
      </div>

      {selection.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {selection.tags.map((tag) => (
            <TagChip color={tag.color} key={tag.id} label={tag.label} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ReportHeader({
  lens,
  mode,
  generatedAt,
}: {
  lens: DashboardLensData;
  mode: ViewMode;
  generatedAt: string;
}) {
  const Icon = MODE_ICONS[mode];
  const updatedAt = new Date(generatedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="panel-shell sticky top-4 z-10 px-4 py-4 md:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <Icon className="size-5 text-sky-300" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Current view</p>
            <h2 className="mt-1 font-display text-3xl text-white">{viewHeading(mode)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {formatGradeLabel(lens.grade)}. Scroll the page like a report and use the left panel for fast switching and pinned context.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HeaderMetric label="Classes" value={lens.classes.length} />
          <HeaderMetric label="Teachers" value={lens.teachers.length} />
          <HeaderMetric label="Documents" value={lens.documents.length} />
          <HeaderMetric label="Updated" value={updatedAt} />
        </div>
      </div>
    </div>
  );
}

function SceneRenderer({
  lens,
  mode,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  mode: ViewMode;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  if (mode === "overview") {
    return <OverviewScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  if (mode === "students") {
    return <StudentsScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  if (mode === "classes") {
    return <ClassesScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  if (mode === "teachers") {
    return <TeachersScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  if (mode === "schedule") {
    return <ScheduleScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  if (mode === "insights") {
    return <FindingsScene lens={lens} onSelectEntity={onSelectEntity} />;
  }
  return <ConnectionsScene lens={lens} onSelectEntity={onSelectEntity} />;
}

function OverviewScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const topClasses = [...lens.classes].sort((a, b) => b.weeklyLoad - a.weeklyLoad).slice(0, 6);
  const topTeachers = [...lens.teachers].sort((a, b) => b.totalPeriods - a.totalPeriods).slice(0, 6);
  const topConnections = [...lens.connections].sort((a, b) => b.score - a.score).slice(0, 4);
  const topTags = aggregateTags([
    ...(lens.summary?.topTags ?? []),
    ...lens.subjects.flatMap((subject) => subject.tags),
    ...lens.documents.flatMap((document) => document.tags),
    ...lens.connections.flatMap((connection) => connection.sharedTags),
  ]).slice(0, 8);
  const totalScheduleEntries = lens.classes.reduce(
    (total, classRecord) => total + classRecord.scheduleEntries.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Classes" note="Visible in this lens" value={lens.classes.length} />
        <StatCard label="Teachers" note="Directly connected here" value={lens.teachers.length} />
        <StatCard label="Documents" note="Curriculum files found" value={lens.documents.length} />
        <StatCard label="Scheduled periods" note="Timetable entries detected" value={totalScheduleEntries} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          description="The fastest way to see where the weekly load is concentrating."
          title="Busiest classes"
        >
          <div className="space-y-3">
            {topClasses.map((classRecord) => (
              <BarLine
                color={classRecord.subjectLoads[0]?.color ?? "#7dd3fc"}
                hint={`${classRecord.subjectLoads.length} subjects • busiest day ${classRecord.busiestDay || "n/a"}`}
                key={classRecord.id}
                label={classRecord.label}
                maxValue={topClasses[0]?.weeklyLoad ?? 1}
                onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
                value={classRecord.weeklyLoad}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          description="Use this list to spot the most distributed teaching loads at a glance."
          title="Teacher load"
        >
          <div className="space-y-3">
            {topTeachers.map((teacher) => (
              <EntityButton
                key={teacher.id}
                onClick={() => onSelectEntity({ type: "teacher", id: teacher.id })}
                subtitle={`${teacher.subjectLabel} • ${teacher.classLoads.length} classes`}
                title={teacher.name}
                trailing={`${teacher.totalPeriods} periods`}
              >
                <div className="flex flex-wrap gap-2">
                  {teacher.gradeKeys.slice(0, 4).map((grade) => (
                    <TagChip color={teacher.color} key={`${teacher.id}-${grade}`} label={formatGradeLabel(grade)} />
                  ))}
                </div>
              </EntityButton>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard
          description="The themes that show up again and again across curriculum, subjects, and connections."
          title="Recurring themes"
        >
          <div className="flex flex-wrap gap-2">
            {topTags.map((tag) => (
              <TagChip color={tag.color} key={tag.id} label={`${tag.label} • ${Math.round(tag.score)}`} />
            ))}
            {topTags.length === 0 ? (
              <EmptyCopy>There are no recurring themes for this scope yet.</EmptyCopy>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          description="Rule-based findings to help you see what needs attention first."
          title="Attention first"
        >
          <div className="space-y-3">
            {lens.alerts.slice(0, 5).map((alert) => (
              <FindingCard alert={alert} key={alert.id} onSelectEntity={onSelectEntity} />
            ))}
            {lens.alerts.length === 0 ? <EmptyCopy>No findings were generated for this scope.</EmptyCopy> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        description="The strongest cross-subject bridges generated from shared tags and complementary themes."
        title="Strongest connections"
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {topConnections.map((connection) => (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4" key={connection.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <Link2 className="size-4 text-sky-300" />
                  <span className="font-medium">
                    {resolveConnectionLabel(lens, connection.sourceId)} and {resolveConnectionLabel(lens, connection.targetId)}
                  </span>
                </div>
                <Badge>{formatStrength(connection.strength)}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{connection.opportunity}</p>
            </div>
          ))}
          {topConnections.length === 0 ? <EmptyCopy>No connection records are available in this scope.</EmptyCopy> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function ClassesScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const sortedClasses = [...lens.classes].sort((a, b) => b.weeklyLoad - a.weeklyLoad);

  return (
    <SectionCard
      description="A direct class-by-class list with load, teachers, documents, and top themes."
      title="Classes"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {sortedClasses.map((classRecord) => (
          <EntityButton
            key={classRecord.id}
            onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
            subtitle={`${formatGradeLabel(classRecord.gradeKey)} • campus ${classRecord.campus}`}
            title={classRecord.label}
            trailing={`${classRecord.weeklyLoad} periods`}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <InlineMetric label="Subjects" value={`${classRecord.subjectLoads.length}`} />
              <InlineMetric label="Teachers" value={`${classRecord.teacherIds.length}`} />
              <InlineMetric label="Docs" value={`${classRecord.documents.length}`} />
            </div>

            <div className="mt-4 space-y-2">
              {classRecord.subjectLoads.slice(0, 4).map((load) => (
                <BarLine
                  color={load.color}
                  hint={load.subjectLabel}
                  key={`${classRecord.id}-${load.subjectId}`}
                  label={load.subjectLabel}
                  maxValue={classRecord.subjectLoads[0]?.sessions ?? 1}
                  value={load.sessions}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {pickTopTags(classRecord.tags, 4).map((tag) => (
                <TagChip color={tag.color} key={`${classRecord.id}-${tag.id}`} label={tag.label} />
              ))}
            </div>
          </EntityButton>
        ))}
        {sortedClasses.length === 0 ? <EmptyCopy>No classes are available for this lens.</EmptyCopy> : null}
      </div>
    </SectionCard>
  );
}

function TeachersScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const sortedTeachers = [...lens.teachers].sort((a, b) => b.totalPeriods - a.totalPeriods);

  return (
    <SectionCard
      description="A more direct workload view so you can read distribution without leaving the page."
      title="Teachers"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {sortedTeachers.map((teacher) => (
          <EntityButton
            key={teacher.id}
            onClick={() => onSelectEntity({ type: "teacher", id: teacher.id })}
            subtitle={teacher.subjectLabel}
            title={teacher.name}
            trailing={`${teacher.totalPeriods} periods`}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <InlineMetric label="Classes" value={`${teacher.classLoads.length}`} />
              <InlineMetric label="Placements" value={`${Math.round(teacher.teachingFootprint)}`} />
              <InlineMetric label="Grades" value={`${teacher.gradeKeys.length}`} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {teacher.classLoads.slice(0, 6).map((load) => (
                <TagChip
                  color={teacher.color}
                  key={`${teacher.id}-${load.classId}`}
                  label={`${load.classLabel} • ${load.periods}`}
                />
              ))}
            </div>
          </EntityButton>
        ))}
        {sortedTeachers.length === 0 ? <EmptyCopy>No teachers are available for this lens.</EmptyCopy> : null}
      </div>
    </SectionCard>
  );
}

function StudentsScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const groupTotals = Object.entries(
    lens.students
      .flatMap((student) => student.groupAssignments)
      .reduce<Record<string, number>>((accumulator, assignment) => {
        accumulator[assignment.value] = (accumulator[assignment.value] ?? 0) + 1;
        return accumulator;
      }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <SectionCard
        description="Student records only appear where nominal source data is available."
        title="Student coverage"
      >
        {lens.students.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Students" note="Nominal records available" value={lens.students.length} />
              <StatCard
                label="Classes"
                note="With student linkage"
                value={new Set(lens.students.map((student) => student.classId)).size}
              />
              <StatCard label="Groups" note="Distinct group labels found" value={groupTotals.length} />
              <StatCard
                label="Assignments"
                note="Total group assignments"
                value={lens.students.reduce((total, student) => total + student.groupAssignments.length, 0)}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {groupTotals.map((group) => (
                <TagChip color="#7dd3fc" key={group.label} label={`${group.label} • ${group.value}`} />
              ))}
            </div>
          </>
        ) : (
          <EmptyCopy>
            The current files do not expose nominal student records for this scope, so this section stays intentionally lightweight.
          </EmptyCopy>
        )}
      </SectionCard>

      {lens.students.length > 0 ? (
        <SectionCard
          description="Click a student to pin their assignments in the left panel."
          title="Students"
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {lens.students.map((student) => (
              <EntityButton
                key={student.id}
                onClick={() => onSelectEntity({ type: "student", id: student.id })}
                subtitle={`${student.classLabel} • ${formatGradeLabel(student.gradeKey)}`}
                title={student.name}
                trailing={student.primaryGroup ?? "No primary group"}
              >
                <div className="flex flex-wrap gap-2">
                  {student.groupAssignments.map((assignment) => (
                    <TagChip
                      color="#38bdf8"
                      key={`${student.id}-${assignment.label}`}
                      label={`${assignment.label}: ${assignment.value}`}
                    />
                  ))}
                </div>
              </EntityButton>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function ScheduleScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const rows = TIME_SLOTS.map((slot) => ({
    slot,
    counts: DAYS.map((day) =>
      lens.classes.reduce(
        (total, classRecord) =>
          total + classRecord.scheduleEntries.filter((entry) => entry.slot === slot && entry.day === day).length,
        0,
      ),
    ),
  }));
  const maxCount = Math.max(...rows.flatMap((row) => row.counts), 0);
  const busiestClasses = [...lens.classes]
    .sort((a, b) => b.scheduleEntries.length - a.scheduleEntries.length)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <SectionCard
        description="A scrollable weekly view instead of a dense panel grid."
        title="Schedule heatmap"
      >
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
          <div className="grid grid-cols-[88px_repeat(5,minmax(0,1fr))] border-b border-white/8 bg-white/[0.03]">
            <div className="px-3 py-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">Slot</div>
            {DAYS.map((day) => (
              <div className="px-3 py-3 text-center text-[11px] uppercase tracking-[0.2em] text-slate-400" key={day}>
                {day}
              </div>
            ))}
          </div>
          {rows.map((row) => (
            <ScheduleRow counts={row.counts} key={row.slot} maxCount={maxCount} slot={row.slot} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        description="Classes with the highest number of schedule entries in the visible scope."
        title="Most occupied classes"
      >
        <div className="space-y-3">
          {busiestClasses.map((classRecord) => (
            <BarLine
              color={classRecord.subjectLoads[0]?.color ?? "#34d399"}
              hint={`${classRecord.scheduleEntries.length} schedule entries`}
              key={classRecord.id}
              label={classRecord.label}
              maxValue={busiestClasses[0]?.scheduleEntries.length ?? 1}
              onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
              value={classRecord.scheduleEntries.length}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function FindingsScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const priorityCount = lens.alerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "high",
  ).length;
  const reviewCount = lens.alerts.filter((alert) => alert.severity === "medium").length;
  const infoCount = lens.alerts.filter((alert) => alert.severity === "info").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Priority" note="Critical or high" value={priorityCount} />
        <StatCard label="Review" note="Medium severity" value={reviewCount} />
        <StatCard label="Info" note="Lower urgency" value={infoCount} />
        <StatCard label="Projects" note="Suggested next steps" value={lens.projects.length} />
      </div>

      <SectionCard
        description="Rule-based findings generated from workload, coverage, and connection heuristics."
        title="Findings"
      >
        <div className="space-y-3">
          {lens.alerts.map((alert) => (
            <FindingCard alert={alert} key={alert.id} onSelectEntity={onSelectEntity} />
          ))}
          {lens.alerts.length === 0 ? <EmptyCopy>No findings were generated for this scope.</EmptyCopy> : null}
        </div>
      </SectionCard>

      <SectionCard
        description="Project ideas derived from the strongest curriculum bridges in the current lens."
        title="Suggested actions"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {lens.projects.map((project) => (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4" key={project.id}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">{project.title}</h3>
                <Badge>{formatStrength(project.strength)}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{project.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {project.subjects.map((subject) => (
                  <TagChip color="#7dd3fc" key={`${project.id}-${subject}`} label={subject} />
                ))}
              </div>
            </div>
          ))}
          {lens.projects.length === 0 ? <EmptyCopy>No project suggestions are available for this scope.</EmptyCopy> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function ConnectionsScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const topThemeConnections = aggregateTags(lens.connections.flatMap((connection) => connection.sharedTags)).slice(0, 8);
  const sortedConnections = [...lens.connections].sort((a, b) => b.score - a.score);
  const hiddenConnections = lens.connections.filter((connection) => connection.hiddenOpportunity).slice(0, 6);

  return (
    <div className="space-y-6">
      <ConnectionMap lens={lens} onSelectEntity={onSelectEntity} />

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard
          description="The tags creating the most bridges between subjects in this scope."
          title="Shared themes"
        >
          <div className="space-y-3">
            {topThemeConnections.map((tag) => (
              <BarLine
                color={tag.color}
                hint={`${Math.round(tag.score)} connection points`}
                key={tag.id}
                label={tag.label}
                maxValue={topThemeConnections[0]?.score ?? 1}
                value={tag.score}
              />
            ))}
            {topThemeConnections.length === 0 ? <EmptyCopy>No cross-subject themes were generated.</EmptyCopy> : null}
          </div>
        </SectionCard>

        <SectionCard
          description="The strongest explicit bridges and the opportunity each one suggests."
          title="Connection list"
        >
          <div className="space-y-3">
            {sortedConnections.map((connection) => (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4" key={connection.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-white">
                    <Link2 className="size-4 text-sky-300" />
                    <span className="font-medium">
                      {resolveConnectionLabel(lens, connection.sourceId)} and {resolveConnectionLabel(lens, connection.targetId)}
                    </span>
                  </div>
                  <Badge>{formatStrength(connection.strength)}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{connection.rationale}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{connection.opportunity}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {connection.sharedTags.map((tag) => (
                    <TagChip color={tag.color} key={`${connection.id}-${tag.id}`} label={tag.label} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.1]"
                    onClick={() => onSelectEntity({ type: "subject", id: connection.sourceId })}
                    type="button"
                  >
                    Open {resolveConnectionLabel(lens, connection.sourceId)}
                  </button>
                  <button
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.1]"
                    onClick={() => onSelectEntity({ type: "subject", id: connection.targetId })}
                    type="button"
                  >
                    Open {resolveConnectionLabel(lens, connection.targetId)}
                  </button>
                </div>
              </div>
            ))}
            {sortedConnections.length === 0 ? <EmptyCopy>No connection records are available for this scope.</EmptyCopy> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        description="Promising low-signal links that may become interesting pilots."
        title="Emerging opportunities"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          {hiddenConnections.map((connection) => (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4" key={connection.id}>
              <div className="font-medium text-white">
                {resolveConnectionLabel(lens, connection.sourceId)} and {resolveConnectionLabel(lens, connection.targetId)}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{connection.opportunity}</p>
            </div>
          ))}
          {hiddenConnections.length === 0 ? (
            <EmptyCopy>No emerging opportunities were marked in this scope.</EmptyCopy>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function ConnectionMap({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleSelectNode = (nodeId: string) => {
    setFocusedNodeId((current) => (current === nodeId ? null : nodeId));
    selectEntityFromNodeId(lens, nodeId, onSelectEntity);
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-white/8 px-4 py-4 md:px-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Map</p>
        <h3 className="mt-2 font-display text-2xl text-white">Knowledge network</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Click a node to pin it in the left sidebar. The graph now sits inside the page instead of living in a separate panel.
        </p>
      </div>

      <div className="h-[420px] p-3 md:h-[520px]">
        {lens.network.nodes.length > 0 && lens.network.links.length > 0 ? (
          <NetworkGraph
            focusedNodeId={focusedNodeId}
            hoveredNodeId={hoveredNodeId}
            links={lens.network.links}
            nodes={lens.network.nodes}
            onHoverNode={setHoveredNodeId}
            onSelectNode={handleSelectNode}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-white/[0.03] px-6 text-center text-sm leading-6 text-slate-300">
            No network map is available for this scope yet.
          </div>
        )}
      </div>
    </Card>
  );
}

function selectEntityFromNodeId(
  lens: DashboardLensData,
  nodeId: string,
  onSelectEntity: (entity: SelectedEntity | null) => void,
) {
  if (lens.classes.some((classRecord) => classRecord.id === nodeId)) {
    onSelectEntity({ type: "class", id: nodeId });
    return;
  }
  if (lens.teachers.some((teacher) => teacher.id === nodeId)) {
    onSelectEntity({ type: "teacher", id: nodeId });
    return;
  }
  if (lens.subjects.some((subject) => subject.id === nodeId)) {
    onSelectEntity({ type: "subject", id: nodeId });
  }
}

function resolveSelectedEntity(data: SchoolIntelligenceDataset, selectedEntity: SelectedEntity | null): ResolvedEntity | null {
  if (!selectedEntity) return null;

  if (selectedEntity.type === "class") {
    const classRecord = data.classes.find((item) => item.id === selectedEntity.id);
    if (!classRecord) return null;
    const teacherNames = data.teachers
      .filter((teacher) => teacher.classLoads.some((load) => load.classId === classRecord.id))
      .map((teacher) => teacher.name);

    return {
      kind: "Class",
      title: classRecord.label,
      subtitle: `${formatGradeLabel(classRecord.gradeKey)} • campus ${classRecord.campus}`,
      metrics: [
        { label: "Weekly load", value: `${classRecord.weeklyLoad}` },
        { label: "Subjects", value: `${classRecord.subjectLoads.length}` },
        { label: "Teachers", value: `${teacherNames.length || classRecord.teacherIds.length}` },
      ],
      details: [
        { label: "Busiest day", value: classRecord.busiestDay || "Not available" },
        {
          label: "Subject mix",
          value:
            classRecord.subjectLoads.length > 0
              ? classRecord.subjectLoads.map((load) => `${load.subjectLabel} (${load.sessions})`).join(", ")
              : "No subjects linked",
        },
        {
          label: "Teachers",
          value: teacherNames.length > 0 ? teacherNames.join(", ") : "No teacher names linked",
        },
      ],
      tags: pickTopTags(classRecord.tags, 6),
    };
  }

  if (selectedEntity.type === "teacher") {
    const teacher = data.teachers.find((item) => item.id === selectedEntity.id);
    if (!teacher) return null;

    return {
      kind: "Teacher",
      title: teacher.name,
      subtitle: teacher.subjectLabel,
      metrics: [
        { label: "Periods", value: `${teacher.totalPeriods}` },
        { label: "Classes", value: `${teacher.classLoads.length}` },
        { label: "Placements", value: `${Math.round(teacher.teachingFootprint)}` },
      ],
      details: [
        {
          label: "Grade coverage",
          value:
            teacher.gradeKeys
              .filter((grade) => grade !== "all")
              .map((grade) => formatGradeLabel(grade))
              .join(", ") || "Not available",
        },
        {
          label: "Class assignments",
          value:
            teacher.classLoads.length > 0
              ? teacher.classLoads.map((load) => `${load.classLabel} (${load.periods})`).join(", ")
              : "No class assignments linked",
        },
        {
          label: "Campus totals",
          value: `JK AF ${teacher.campusLoadTotals.jkAf}, JK EM ${teacher.campusLoadTotals.jkEm}, ABV AF ${teacher.campusLoadTotals.abvAf}, ABV EM ${teacher.campusLoadTotals.abvEm}`,
        },
      ],
      tags: [],
    };
  }

  if (selectedEntity.type === "student") {
    const student = data.students.find((item) => item.id === selectedEntity.id);
    if (!student) return null;

    return {
      kind: "Student",
      title: student.name,
      subtitle: `${student.classLabel} • ${formatGradeLabel(student.gradeKey)}`,
      metrics: [
        { label: "Campus", value: student.campus },
        { label: "Groups", value: `${student.groupAssignments.length}` },
        { label: "Primary group", value: student.primaryGroup ?? "n/a" },
      ],
      details: [
        { label: "Registry", value: student.registry ?? "Not available" },
        { label: "Email", value: student.email ?? "Not available" },
        {
          label: "Assignments",
          value:
            student.groupAssignments.length > 0
              ? student.groupAssignments.map((group) => `${group.label}: ${group.value}`).join(", ")
              : "No group assignments linked",
        },
      ],
      tags: [],
    };
  }

  const subject = data.subjects.find((item) => item.id === selectedEntity.id);
  if (!subject) return null;

  return {
    kind: "Subject",
    title: subject.label,
    subtitle: subject.domain,
    metrics: [
      { label: "Classes", value: `${subject.classIds.length}` },
      { label: "Teachers", value: `${subject.teacherIds.length}` },
      { label: "Documents", value: `${subject.documentIds.length}` },
    ],
    details: [
      {
        label: "Grades",
        value: subject.grades.map((grade) => formatGradeLabel(grade)).join(", "),
      },
      {
        label: "Schedule codes",
        value: subject.scheduleCodes.join(", ") || "Not available",
      },
      {
        label: "Domain",
        value: subject.domain,
      },
    ],
    tags: pickTopTags(subject.tags, 6),
  };
}

function SidebarBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">
        {typeof value === "number" ? compactNumber(value) : value}
      </div>
    </div>
  );
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 md:p-5", className)}>
      <div>
        <h3 className="font-display text-2xl text-white">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function StatCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card className="rounded-2xl p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="mt-3 text-4xl font-semibold text-white">{compactNumber(value)}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{note}</p>
    </Card>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function EntityButton({
  title,
  subtitle,
  trailing,
  onClick,
  children,
}: {
  title: string;
  subtitle: string;
  trailing?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="w-full rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06] disabled:cursor-default"
      disabled={!onClick}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
        </div>
        {trailing ? (
          <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200">
            {trailing}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </button>
  );
}

function FindingCard({
  alert,
  onSelectEntity,
}: {
  alert: InsightAlert;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const firstRelatedId = alert.relatedIds[0];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{alert.title}</h3>
        <Badge className={severityClass(alert.severity)}>{severityLabel(alert.severity)}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{alert.description}</p>
      {firstRelatedId ? (
        <div className="mt-4">
          <button
            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.1]"
            onClick={() => {
              if (alert.relatedType === "class") onSelectEntity({ type: "class", id: firstRelatedId });
              if (alert.relatedType === "teacher") onSelectEntity({ type: "teacher", id: firstRelatedId });
              if (alert.relatedType === "subject") onSelectEntity({ type: "subject", id: firstRelatedId });
            }}
            type="button"
          >
            Open related item
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyCopy({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-300">{children}</p>;
}

function BarLine({
  label,
  value,
  maxValue,
  hint,
  color,
  onClick,
}: {
  label: string;
  value: number;
  maxValue: number;
  hint: string;
  color: string;
  onClick?: () => void;
}) {
  const width = maxValue > 0 ? Math.max(6, (value / maxValue) * 100) : 0;

  return (
    <button
      className="w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06] disabled:cursor-default"
      disabled={!onClick}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-white">{label}</div>
          <div className="mt-1 text-sm text-slate-400">{hint}</div>
        </div>
        <div className="text-right text-sm font-semibold text-white">{compactNumber(value)}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/6">
        <div className="h-full rounded-full" style={{ backgroundColor: color, width: `${width}%` }} />
      </div>
    </button>
  );
}

function TagChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-100"
      style={{ backgroundColor: `${color}22`, borderColor: `${color}55` }}
    >
      {label}
    </span>
  );
}

function ScheduleRow({ slot, counts, maxCount }: { slot: string; counts: number[]; maxCount: number }) {
  return (
    <div className="grid grid-cols-[88px_repeat(5,minmax(0,1fr))] border-b border-white/8 last:border-b-0">
      <div className="px-3 py-3 text-sm text-slate-300">{slot}</div>
      {counts.map((count, index) => {
        const opacity = maxCount > 0 ? Math.max(0.08, count / maxCount) : 0.08;
        return (
          <div className="px-2 py-2" key={`${slot}-${DAYS[index]}`}>
            <div
              className="flex h-10 items-center justify-center rounded-[14px] border border-white/6 text-sm text-white"
              style={{ backgroundColor: `rgba(56,189,248,${opacity})` }}
            >
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function aggregateTags(tags: SharedTagScore[]) {
  return Object.values(
    tags.reduce<Record<string, SharedTagScore>>((accumulator, tag) => {
      const current = accumulator[tag.id];
      if (current) {
        current.score += tag.score;
        current.matchedKeywords = [...new Set([...current.matchedKeywords, ...tag.matchedKeywords])];
      } else {
        accumulator[tag.id] = { ...tag, matchedKeywords: [...tag.matchedKeywords] };
      }
      return accumulator;
    }, {}),
  ).sort((a, b) => b.score - a.score);
}

function resolveConnectionLabel(lens: DashboardLensData, id: string) {
  const classRecord = lens.classes.find((item) => item.id === id);
  if (classRecord) return classRecord.label;
  const teacher = lens.teachers.find((item) => item.id === id);
  if (teacher) return teacher.name;
  const subject = lens.subjects.find((item) => item.id === id);
  if (subject) return subject.label;
  const topic = lens.network.nodes.find((node) => node.id === id);
  if (topic) return topic.label;
  return id;
}

function viewHeading(mode: ViewMode) {
  if (mode === "overview") return "Overview";
  if (mode === "students") return "Students";
  if (mode === "classes") return "Classes";
  if (mode === "teachers") return "Teachers";
  if (mode === "schedule") return "Schedule";
  if (mode === "insights") return "Findings";
  return "Connections";
}

function severityLabel(severity: InsightAlert["severity"]) {
  if (severity === "critical" || severity === "high") return "Priority";
  if (severity === "medium") return "Review";
  return "Info";
}

function severityClass(severity: InsightAlert["severity"]) {
  if (severity === "critical" || severity === "high") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  if (severity === "medium") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-50";
  return "border-sky-300/20 bg-sky-300/10 text-sky-50";
}
