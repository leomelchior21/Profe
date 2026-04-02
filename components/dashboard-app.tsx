"use client";

import { startTransition, useDeferredValue } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CalendarClock,
  Compass,
  Cpu,
  Layers3,
  Network,
  Sparkles,
  Users,
} from "lucide-react";

import { IntelligencePanel } from "@/components/intelligence-panel";
import { NetworkGraph } from "@/components/network-graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GRADE_OPTIONS, TIME_SLOTS, VIEW_OPTIONS } from "@/lib/taxonomy";
import {
  compactNumber,
  formatGradeLabel,
  formatStrength,
  groupBy,
  pickTopTags,
} from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboard-store";
import type {
  ClassRecord,
  CurriculumDocument,
  DashboardLensData,
  NetworkNode,
  SchoolIntelligenceDataset,
  SelectedEntity,
  SubjectRecord,
  TeacherRecord,
  ViewMode,
} from "@/types";

const MODE_ICONS: Record<ViewMode, typeof Compass> = {
  overview: Compass,
  students: Users,
  classes: Layers3,
  teachers: BookOpenText,
  schedule: CalendarClock,
  insights: Sparkles,
  interdisciplinary: Network,
};

const SCENE_ANIMATION = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.26, ease: "easeOut" as const },
};

export function DashboardApp({ data }: { data: SchoolIntelligenceDataset }) {
  const {
    activeGrade,
    activeMode,
    selectedEntity,
    focusedNodeId,
    hoveredNodeId,
    setActiveGrade,
    setActiveMode,
    setSelectedEntity,
    setFocusedNodeId,
    setHoveredNodeId,
  } = useDashboardStore();

  const deferredGrade = useDeferredValue(activeGrade);
  const lens = buildLensData(data, deferredGrade);
  const focusedNode = lens.network.nodes.find((node) => node.id === focusedNodeId);
  const focusedLinks = focusedNode
    ? lens.network.links.filter((link) => link.source === focusedNode.id || link.target === focusedNode.id)
    : [];

  return (
    <>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_minmax(260px,34vh)] gap-4 overflow-hidden p-3 lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:grid-rows-1 lg:p-5">
        <ControlRail
          activeGrade={activeGrade}
          activeMode={activeMode}
          onGradeChange={(grade) => startTransition(() => setActiveGrade(grade))}
          onModeChange={(mode) => startTransition(() => setActiveMode(mode))}
          summary={lens.summary}
        />

        <main className="panel-shell flex min-h-0 flex-col overflow-hidden">
          <MissionHeader lens={lens} mode={activeMode} />
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 md:px-5 md:pb-5">
            <AnimatePresence mode="wait">
              <motion.div
                animate={SCENE_ANIMATION.animate}
                className="h-full"
                exit={SCENE_ANIMATION.exit}
                initial={SCENE_ANIMATION.initial}
                key={`${activeMode}-${deferredGrade}`}
                transition={SCENE_ANIMATION.transition}
              >
                <SceneRenderer
                  lens={lens}
                  mode={activeMode}
                  onFocusNode={(nodeId) =>
                    startTransition(() => {
                      setFocusedNodeId(nodeId);
                      const node = lens.network.nodes.find((item) => item.id === nodeId);
                      if (node?.kind === "class" || node?.kind === "teacher" || node?.kind === "subject") {
                        setSelectedEntity({ type: node.kind, id: node.id });
                      }
                    })
                  }
                  onHoverNode={setHoveredNodeId}
                  onSelectEntity={setSelectedEntity}
                  focusedNodeId={focusedNodeId}
                  hoveredNodeId={hoveredNodeId}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <aside className="panel-shell min-h-0 overflow-hidden">
          <IntelligencePanel
            focusedLinks={focusedLinks}
            focusedNode={focusedNode}
            lens={lens}
            mode={activeMode}
            selectedEntity={selectedEntity}
          />
        </aside>
      </div>

      <EntityDialog
        data={data}
        onOpenChange={(open) => {
          if (!open) setSelectedEntity(null);
        }}
        selectedEntity={selectedEntity}
      />
    </>
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
              subject.id === "maker" || subject.id === "maker-teatro" || subject.classIds.some((classId) => classIds.has(classId)),
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

  const nodeIds = new Set(
    data.network.nodes
      .filter((node) => grade === "all" || node.gradeKeys.includes("all") || node.gradeKeys.includes(grade))
      .map((node) => node.id),
  );

  const nodes = data.network.nodes.filter((node) => nodeIds.has(node.id));
  const links = data.network.links.filter(
    (link) =>
      nodeIds.has(link.source) &&
      nodeIds.has(link.target) &&
      (grade === "all" || link.gradeKeys.includes("all") || link.gradeKeys.includes(grade)),
  );

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
    network: { nodes, links },
  };
}

function ControlRail({
  activeGrade,
  activeMode,
  onGradeChange,
  onModeChange,
  summary,
}: {
  activeGrade: DashboardLensData["grade"];
  activeMode: ViewMode;
  onGradeChange: (grade: DashboardLensData["grade"]) => void;
  onModeChange: (mode: ViewMode) => void;
  summary?: DashboardLensData["summary"];
}) {
  return (
    <aside className="panel-shell flex min-h-0 flex-col justify-between gap-5 p-4 md:p-5">
      <div>
        <div className="space-y-3">
          <Badge>Educational Intelligence System</Badge>
          <div>
            <h1 className="font-display text-3xl text-white">Mission Control</h1>
            <p className="mt-2 max-w-[20rem] text-sm leading-6 text-slate-400">
              Panorama pedagógico vivo para entender turmas, detectar riscos e descobrir conexões.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Grades</p>
          <div className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-2">
            {GRADE_OPTIONS.map((grade) => (
              <button
                className={`rounded-[20px] border px-3 py-3 text-left transition ${
                  activeGrade === grade.id
                    ? "border-white/20 bg-white/12 text-white shadow-[0_12px_32px_rgba(14,165,233,0.18)]"
                    : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                }`}
                key={grade.id}
                onClick={() => onGradeChange(grade.id)}
                type="button"
              >
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{grade.shortLabel}</div>
                <div className="mt-2 text-base font-medium">{grade.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Views</p>
          <div className="mt-3 space-y-2">
            {VIEW_OPTIONS.map((view) => {
              const Icon = MODE_ICONS[view.id];
              return (
                <button
                  className={`flex w-full items-center justify-between rounded-[22px] border px-3 py-3 text-left transition ${
                    activeMode === view.id
                      ? "border-sky-300/30 bg-sky-300/10 text-white"
                      : "border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
                  }`}
                  key={view.id}
                  onClick={() => onModeChange(view.id)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 text-sky-300" />
                    <div>
                      <div className="font-medium">{view.label}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-400">{view.helper}</div>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-slate-500" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Card className="rounded-[26px] bg-sky-400/8 p-4">
        <p className="text-[11px] uppercase tracking-[0.28em] text-sky-100/70">Lens Status</p>
        <h3 className="mt-2 font-display text-2xl text-white">{summary?.label ?? formatGradeLabel(activeGrade)}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {summary?.coverage.note ??
            "Visão geral combinando dados de turmas, horários, professores e documentos curriculares."}
        </p>
      </Card>
    </aside>
  );
}

function MissionHeader({ lens, mode }: { lens: DashboardLensData; mode: ViewMode }) {
  const Icon = MODE_ICONS[mode];

  return (
    <div className="border-b border-white/10 px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <Icon className="size-5 text-sky-300" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Current Lens</p>
            <h2 className="mt-1 font-display text-2xl text-white">{formatGradeLabel(lens.grade)}</h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <MetricPill label="Turmas" value={lens.classes.length} />
          <MetricPill label="Docentes" value={lens.teachers.length} />
          <MetricPill label="Currículos" value={lens.documents.length} />
          <MetricPill label="Conexões" value={lens.connections.length} />
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{compactNumber(value)}</div>
    </div>
  );
}

function SceneRenderer({
  lens,
  mode,
  onSelectEntity,
  onFocusNode,
  onHoverNode,
  focusedNodeId,
  hoveredNodeId,
}: {
  lens: DashboardLensData;
  mode: ViewMode;
  onSelectEntity: (entity: SelectedEntity | null) => void;
  onFocusNode: (nodeId: string) => void;
  onHoverNode: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
}) {
  if (mode === "overview") return <OverviewScene lens={lens} onSelectEntity={onSelectEntity} />;
  if (mode === "classes") return <ClassesScene lens={lens} onSelectEntity={onSelectEntity} />;
  if (mode === "teachers") return <TeachersScene lens={lens} onSelectEntity={onSelectEntity} />;
  if (mode === "students") return <StudentsScene lens={lens} onSelectEntity={onSelectEntity} />;
  if (mode === "schedule") return <ScheduleScene lens={lens} />;
  if (mode === "insights") return <InsightsScene lens={lens} />;
  return (
    <InterdisciplinaryScene
      focusedNodeId={focusedNodeId}
      hoveredNodeId={hoveredNodeId}
      lens={lens}
      onFocusNode={onFocusNode}
      onHoverNode={onHoverNode}
    />
  );
}

function OverviewScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const leadAlert = lens.alerts[0];
  const topConnection = lens.connections[0];
  const signalTags = lens.summary?.topTags?.length ? lens.summary.topTags : pickTopTags(lens.subjects.flatMap((subject) => subject.tags), 4);

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[1.18fr_0.82fr] xl:grid-rows-[1fr_1fr]">
      <Card className="relative overflow-hidden xl:row-span-2">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(103,232,249,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(251,113,133,0.12),transparent_24%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div>
            <Badge>{lens.summary?.label ?? "Toda a escola"}</Badge>
            <h3 className="mt-5 max-w-xl font-display text-4xl leading-tight text-white">
              Entenda a escola em 30 segundos e encontre o próximo melhor movimento pedagógico.
            </h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <BigMetric label="Turmas ativas" value={lens.classes.length} />
              <BigMetric label="Docentes conectados" value={lens.teachers.length} />
              <BigMetric label="Trilhas curriculares" value={lens.documents.length} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Main Alert</p>
              <p className="mt-3 text-xl font-semibold text-white">{leadAlert?.title ?? "Sistema estável"}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {leadAlert?.description ?? "Nenhum alerta dominante encontrado para esta lente."}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signal Tags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {signalTags.map((tag) => (
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em]"
                    key={tag.id}
                    style={{ borderColor: `${tag.color}55`, color: tag.color }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Classes at a Glance</p>
        <div className="mt-4 space-y-3">
          {lens.classes.slice(0, 5).map((classRecord) => (
            <button
              className="flex w-full items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.06]"
              key={classRecord.id}
              onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
              type="button"
            >
              <div>
                <p className="font-medium text-white">{classRecord.label}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {classRecord.weeklyLoad} blocos • {classRecord.teacherIds.length} docentes
                </p>
              </div>
              <Badge>{classRecord.busiestDay}</Badge>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Interdisciplinary Spotlight</p>
        <div className="mt-4 space-y-3">
          {lens.connections.slice(0, 4).map((connection) => (
            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3" key={connection.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{connection.rationale}</p>
                <Badge>{formatStrength(connection.strength)}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{connection.opportunity}</p>
            </div>
          ))}
          {topConnection ? (
            <div className="rounded-[22px] border border-dashed border-sky-300/20 bg-sky-300/6 px-3 py-3 text-sm text-sky-100/90">
              A lente interdisciplinar aprofunda essas pontes em forma de mapa vivo.
            </div>
          ) : null}
        </div>
      </Card>
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
  return (
    <div className="grid h-full auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
      {lens.classes.slice(0, 16).map((classRecord) => (
        <button
          className="text-left"
          key={classRecord.id}
          onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
          type="button"
        >
          <Card className="flex h-full flex-col justify-between p-4 transition hover:-translate-y-1 hover:bg-white/[0.06]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <Badge>{classRecord.label}</Badge>
                <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {classRecord.weeklyLoad} blocos
                </span>
              </div>
              <h3 className="mt-4 font-display text-3xl text-white">{classRecord.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {classRecord.teacherIds.length} docentes conectados • pico em {classRecord.busiestDay}
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {classRecord.subjectLoads.slice(0, 2).map((subjectLoad) => (
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-3" key={subjectLoad.subjectId}>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{subjectLoad.subjectLabel}</div>
                    <div className="mt-2 text-xl font-semibold text-white">{subjectLoad.sessions}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {classRecord.tags.slice(0, 2).map((tag) => (
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.16em]"
                    key={tag.id}
                    style={{ borderColor: `${tag.color}55`, color: tag.color }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}

function TeachersScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  const visibleTeachers = lens.teachers.slice(0, 12);

  return (
    <div className="grid h-full auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
      {visibleTeachers.map((teacher) => (
        <button
          className="text-left"
          key={teacher.id}
          onClick={() => onSelectEntity({ type: "teacher", id: teacher.id })}
          type="button"
        >
          <Card className="flex h-full flex-col justify-between transition hover:-translate-y-1 hover:bg-white/[0.06]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <Badge style={{ color: teacher.color }}>{teacher.subjectLabel}</Badge>
                <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {teacher.totalPeriods} aulas
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-white">{teacher.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {teacher.classLoads.length} turmas no radar • {teacher.gradeKeys.map(formatGradeLabel).join(", ")}
              </p>
            </div>

            <div className="mt-6">
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (teacher.totalPeriods / 24) * 100)}%`,
                    backgroundColor: teacher.color,
                  }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {teacher.classLoads.slice(0, 6).map((load) => (
                  <Badge key={`${teacher.id}-${load.classId}`}>{load.classLabel}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </button>
      ))}

      {lens.teachers.length > visibleTeachers.length ? (
        <Card className="flex items-center justify-center text-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Visible Sample</p>
            <p className="mt-3 font-display text-4xl text-white">+{lens.teachers.length - visibleTeachers.length}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              O centro mostra os docentes com maior impacto nesta lente. O painel lateral aprofunda o restante.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function StudentsScene({
  lens,
  onSelectEntity,
}: {
  lens: DashboardLensData;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}) {
  if (lens.students.length === 0) {
    return (
      <div className="grid h-full gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="flex flex-col justify-between">
          <div>
            <Badge>Coverage Gap</Badge>
            <h3 className="mt-5 font-display text-4xl leading-tight text-white">
              Esta lente ainda não possui nomes de estudantes nos arquivos atuais.
            </h3>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Em vez de inventar dados, o sistema migra para leitura estrutural: horários, docentes,
              currículos e padrões de turma continuam disponíveis para apoiar decisão.
            </p>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <BigMetric label="Turmas visíveis" value={lens.classes.length} />
            <BigMetric label="Docentes ligados" value={lens.teachers.length} />
            <BigMetric label="Currículos lidos" value={lens.documents.length} />
          </div>
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">O que ainda dá para ver</p>
          <div className="mt-4 space-y-3">
            {lens.classes.slice(0, 5).map((classRecord) => (
              <button
                className="flex w-full items-center justify-between rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.06]"
                key={classRecord.id}
                onClick={() => onSelectEntity({ type: "class", id: classRecord.id })}
                type="button"
              >
                <div>
                  <p className="font-medium text-white">{classRecord.label}</p>
                  <p className="mt-1 text-sm text-slate-400">{classRecord.teacherIds.length} docentes ligados</p>
                </div>
                <Badge>{classRecord.subjectLoads.length} áreas</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid h-full auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
      {lens.students.slice(0, 12).map((student) => (
        <button
          className="text-left"
          key={student.id}
          onClick={() => onSelectEntity({ type: "student", id: student.id })}
          type="button"
        >
          <Card className="h-full transition hover:-translate-y-1 hover:bg-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <Badge>{student.classLabel}</Badge>
              {student.primaryGroup ? <Badge>{student.primaryGroup}</Badge> : null}
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">{student.name}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {student.groupAssignments.map((assignment) => (
                <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300" key={assignment.label}>
                  {assignment.label}: {assignment.value}
                </span>
              ))}
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}

function ScheduleScene({ lens }: { lens: DashboardLensData }) {
  const occupancy = TIME_SLOTS.map((slot) => {
    const byDay = ["Seg", "Ter", "Qua", "Qui", "Sex"].map((day) =>
      lens.classes.reduce(
        (total, classRecord) => total + classRecord.scheduleEntries.filter((entry) => entry.slot === slot && entry.day === day).length,
        0,
      ),
    );
    return { slot, values: byDay };
  });

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[1.12fr_0.88fr]">
      <Card className="overflow-hidden">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Heatmap de Ocupação</p>
        <div className="mt-5 grid grid-cols-[80px_repeat(5,minmax(0,1fr))] gap-2">
          <div />
          {["Seg", "Ter", "Qua", "Qui", "Sex"].map((day) => (
            <div className="text-center text-xs uppercase tracking-[0.18em] text-slate-400" key={day}>
              {day}
            </div>
          ))}
          {occupancy.map((row) => (
            <ScheduleRow key={row.slot} slot={row.slot} values={row.values} />
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Sinais de Ritmo</p>
        <div className="mt-4 space-y-3">
          {lens.classes.slice(0, 6).map((classRecord) => (
            <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-3" key={classRecord.id}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{classRecord.label}</p>
                <Badge>{classRecord.busiestDay}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {classRecord.weeklyLoad} blocos • média diária {classRecord.averageDailyLoad.toFixed(1)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InsightsScene({ lens }: { lens: DashboardLensData }) {
  return (
    <div className="grid h-full gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Top Alerts</p>
        <div className="mt-4 space-y-3">
          {lens.alerts.slice(0, 6).map((alert) => (
            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4" key={alert.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{alert.title}</p>
                <Badge>{alert.severity}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{alert.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Hidden Opportunities</p>
        <div className="mt-4 space-y-3">
          {lens.connections
            .filter((connection) => connection.hiddenOpportunity)
            .slice(0, 5)
            .map((connection) => (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4" key={connection.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{connection.rationale}</p>
                  <Badge>{formatStrength(connection.strength)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{connection.opportunity}</p>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}

function InterdisciplinaryScene({
  lens,
  focusedNodeId,
  hoveredNodeId,
  onFocusNode,
  onHoverNode,
}: {
  lens: DashboardLensData;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  onFocusNode: (nodeId: string) => void;
  onHoverNode: (nodeId: string | null) => void;
}) {
  return (
    <div className="grid h-full gap-4 grid-rows-[minmax(0,1fr)_auto]">
      <NetworkGraph
        focusedNodeId={focusedNodeId}
        hoveredNodeId={hoveredNodeId}
        links={lens.network.links}
        nodes={lens.network.nodes}
        onHoverNode={onHoverNode}
        onSelectNode={onFocusNode}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {lens.projects.slice(0, 3).map((project) => (
          <Card key={project.id}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Project Generator</p>
            <h3 className="mt-3 text-lg font-semibold text-white">{project.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{project.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EntityDialog({
  data,
  selectedEntity,
  onOpenChange,
}: {
  data: SchoolIntelligenceDataset;
  selectedEntity: SelectedEntity | null;
  onOpenChange: (open: boolean) => void;
}) {
  const entity = resolveSelectedEntity(data, selectedEntity);

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(entity)}>
      {entity ? (
        <DialogContent>
          <DialogTitle className="font-display text-3xl text-white">{entity.title}</DialogTitle>
          <p className="mt-3 text-sm leading-7 text-slate-300">{entity.description}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {entity.metrics.map((metric) => (
              <Card className="rounded-[24px] p-4" key={metric.label}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {entity.tags.map((tag) => (
              <span
                className="rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.16em]"
                key={tag.id}
                style={{ borderColor: `${tag.color}55`, color: tag.color }}
              >
                {tag.label}
              </span>
            ))}
          </div>
          {entity.lines.length > 0 ? (
            <div className="mt-6 space-y-3">
              {entity.lines.map((line) => (
                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4" key={line}>
                  <p className="text-sm leading-6 text-slate-300">{line}</p>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function resolveSelectedEntity(data: SchoolIntelligenceDataset, selectedEntity: SelectedEntity | null) {
  if (!selectedEntity) return null;

  if (selectedEntity.type === "class") {
    const classRecord = data.classes.find((item) => item.id === selectedEntity.id);
    if (!classRecord) return null;
    return {
      title: classRecord.label,
      description: `${classRecord.weeklyLoad} blocos semanais, ${classRecord.teacherIds.length} docentes associados e foco temático em ${classRecord.tags
        .map((tag) => tag.label)
        .join(", ") || "organização de rotina"}.`,
      metrics: [
        { label: "Weekly Load", value: String(classRecord.weeklyLoad) },
        { label: "Teachers", value: String(classRecord.teacherIds.length) },
        { label: "Subjects", value: String(classRecord.subjectLoads.length) },
        { label: "Busiest Day", value: classRecord.busiestDay },
      ],
      tags: classRecord.tags,
      lines: classRecord.subjectLoads.map((load) => `${load.subjectLabel}: ${load.sessions} blocos`),
    };
  }

  if (selectedEntity.type === "teacher") {
    const teacher = data.teachers.find((item) => item.id === selectedEntity.id);
    if (!teacher) return null;
    return {
      title: teacher.name,
      description: `${teacher.subjectLabel} com ${teacher.totalPeriods} aulas totais e atuação em ${teacher.classLoads.length} turmas.`,
      metrics: [
        { label: "Component", value: teacher.subjectLabel },
        { label: "Total Periods", value: String(teacher.totalPeriods) },
        { label: "Classes", value: String(teacher.classLoads.length) },
        { label: "Grades", value: teacher.gradeKeys.map(formatGradeLabel).join(", ") || "N/A" },
      ],
      tags: pickTopTags(
        data.subjects.find((subject) => subject.id === teacher.subjectId)?.tags ?? [],
        4,
      ),
      lines: teacher.classLoads.map((load) => `${load.classLabel}: ${load.periods} blocos`),
    };
  }

  if (selectedEntity.type === "student") {
    const student = data.students.find((item) => item.id === selectedEntity.id);
    if (!student) return null;
    return {
      title: student.name,
      description: `Pertence à ${student.classLabel} e aparece com ${student.groupAssignments.length} vínculos de grupo nos arquivos disponíveis.`,
      metrics: [
        { label: "Class", value: student.classLabel },
        { label: "Primary Group", value: student.primaryGroup ?? "N/A" },
        { label: "Registry", value: student.registry ?? "N/A" },
        { label: "Campus", value: student.campus },
      ],
      tags: [],
      lines: student.groupAssignments.map((assignment) => `${assignment.label}: ${assignment.value}`),
    };
  }

  const subject = data.subjects.find((item) => item.id === selectedEntity.id);
  if (!subject) return null;
  return {
    title: subject.label,
    description: `${subject.domain} com ${subject.documentIds.length} documentos, ${subject.teacherIds.length} docentes e ${subject.classIds.length} turmas ligadas.`,
    metrics: [
      { label: "Domain", value: subject.domain },
      { label: "Documents", value: String(subject.documentIds.length) },
      { label: "Teachers", value: String(subject.teacherIds.length) },
      { label: "Classes", value: String(subject.classIds.length) },
    ],
    tags: subject.tags,
    lines: subject.grades.map((grade) => formatGradeLabel(grade)),
  };
}

function ScheduleRow({ slot, values }: { slot: string; values: number[] }) {
  return (
    <>
      <div className="flex items-center text-xs uppercase tracking-[0.18em] text-slate-400">{slot}</div>
      {values.map((value, index) => (
        <div
          className="flex h-12 items-center justify-center rounded-2xl border border-white/8 text-sm font-medium text-white"
          key={`${slot}-${index}`}
          style={{
            backgroundColor:
              value === 0
                ? "rgba(255,255,255,0.02)"
                : `rgba(52,211,153,${Math.min(0.75, 0.12 + value * 0.08)})`,
          }}
        >
          {value || "—"}
        </div>
      ))}
    </>
  );
}

function BigMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-3 font-display text-4xl text-white">{compactNumber(value)}</p>
    </div>
  );
}
