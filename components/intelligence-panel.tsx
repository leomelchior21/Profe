"use client";

import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, BookOpenText, Lightbulb, Radar, Sparkles, UsersRound } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatGradeLabel, formatStrength } from "@/lib/utils";
import type {
  DashboardLensData,
  InsightAlert,
  NetworkLink,
  NetworkNode,
  SelectedEntity,
  ViewMode,
} from "@/types";

interface IntelligencePanelProps {
  mode: ViewMode;
  lens: DashboardLensData;
  selectedEntity: SelectedEntity | null;
  focusedNode?: NetworkNode;
  focusedLinks: NetworkLink[];
}

export function IntelligencePanel({
  mode,
  lens,
  selectedEntity,
  focusedNode,
  focusedLinks,
}: IntelligencePanelProps) {
  const title = focusedNode ? focusedNode.label : panelTitle(mode);
  const classLoadData = lens.classes.slice(0, 8).map((classRecord) => ({
    name: classRecord.label,
    value: classRecord.weeklyLoad,
  }));
  const teacherLoadData = lens.teachers.slice(0, 8).map((teacher) => ({
    name: teacher.name.split(" ")[0],
    value: teacher.totalPeriods,
    color: teacher.color,
  }));
  const tagData = lens.subjects
    .flatMap((subject) => subject.tags)
    .reduce<Record<string, { name: string; value: number; color: string }>>((accumulator, tag) => {
      const current = accumulator[tag.id];
      if (current) {
        current.value += tag.score;
      } else {
        accumulator[tag.id] = {
          name: tag.label,
          value: tag.score,
          color: tag.color,
        };
      }
      return accumulator;
    }, {});

  const topTags = Object.values(tagData)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const alertCounts = [
    {
      name: "Alto",
      value: lens.alerts.filter((alert) => alert.severity === "high" || alert.severity === "critical").length,
      color: "#fb7185",
    },
    {
      name: "Médio",
      value: lens.alerts.filter((alert) => alert.severity === "medium").length,
      color: "#facc15",
    },
    {
      name: "Info",
      value: lens.alerts.filter((alert) => alert.severity === "info").length,
      color: "#67e8f9",
    },
  ];

  const studentGroups = lens.students
    .flatMap((student) => student.groupAssignments)
    .reduce<Record<string, number>>((accumulator, assignment) => {
      accumulator[assignment.value] = (accumulator[assignment.value] ?? 0) + 1;
      return accumulator;
    }, {});

  const groupData = Object.entries(studentGroups)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const scheduleLoadByDay = ["Seg", "Ter", "Qua", "Qui", "Sex"].map((day) => ({
    name: day,
    value: lens.classes.reduce(
      (total, classRecord) => total + classRecord.scheduleEntries.filter((entry) => entry.day === day).length,
      0,
    ),
  }));

  const highlightedAlerts = lens.alerts.slice(0, 5);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.34em] text-slate-400">
              Intelligence Panel
            </p>
            <h2 className="mt-2 font-display text-2xl text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {lens.summary?.label ?? formatGradeLabel(lens.grade)}
            </p>
          </div>
          <Badge>{lens.classes.length} turmas</Badge>
        </div>
      </div>

      <div className="custom-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {focusedNode ? (
          <Card className="bg-sky-400/8">
            <div className="flex items-center gap-2 text-sky-100">
              <Radar className="size-4" />
              <span className="text-xs uppercase tracking-[0.24em]">Foco Atual</span>
            </div>
            <p className="mt-3 text-lg font-semibold text-white">{focusedNode.label}</p>
            <p className="mt-1 text-sm text-slate-300">{focusedNode.detail}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">
              {focusedLinks.length} conexões visíveis
            </p>
          </Card>
        ) : null}

        <SummaryStrip lens={lens} selectedEntity={selectedEntity} />

        {mode === "overview" || mode === "classes" ? (
          <ChartCard icon={BookOpenText} title="Carga Semanal por Turma">
            <ResponsiveContainer height={200} width="100%">
              <BarChart data={classLoadData}>
                <XAxis dataKey="name" stroke="rgba(148,163,184,0.45)" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" fill="#67e8f9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {mode === "teachers" ? (
          <ChartCard icon={UsersRound} title="Docentes com Maior Carga">
            <ResponsiveContainer height={220} width="100%">
              <BarChart data={teacherLoadData} layout="vertical" margin={{ left: 4, right: 4 }}>
                <XAxis hide type="number" />
                <YAxis axisLine={false} dataKey="name" tickLine={false} type="category" width={42} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                  {teacherLoadData.map((entry) => (
                    <Cell fill={entry.color} key={entry.name} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {mode === "students" ? (
          <ChartCard icon={UsersRound} title="Distribuição de Grupos">
            {groupData.length > 0 ? (
              <ResponsiveContainer height={200} width="100%">
                <PieChart>
                  <Pie
                    data={groupData}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={76}
                    paddingAngle={2}
                  >
                    {groupData.map((entry, index) => (
                      <Cell
                        fill={["#67e8f9", "#facc15", "#34d399", "#fb7185", "#f97316", "#60a5fa"][index % 6]}
                        key={entry.name}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                Os arquivos atuais não trazem dados nominais de estudantes para esta lente. O painel
                segue usando turmas, horários e currículos.
              </p>
            )}
          </ChartCard>
        ) : null}

        {mode === "schedule" ? (
          <ChartCard icon={Radar} title="Densidade por Dia">
            <ResponsiveContainer height={180} width="100%">
              <BarChart data={scheduleLoadByDay}>
                <XAxis dataKey="name" stroke="rgba(148,163,184,0.45)" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="value" fill="#34d399" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {mode === "insights" || mode === "overview" ? (
          <ChartCard icon={AlertTriangle} title="Pressão do Sistema">
            <ResponsiveContainer height={180} width="100%">
              <BarChart data={alertCounts}>
                <XAxis dataKey="name" stroke="rgba(148,163,184,0.45)" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {alertCounts.map((entry) => (
                    <Cell fill={entry.color} key={entry.name} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}

        {mode === "interdisciplinary" || mode === "overview" ? (
          <ChartCard icon={Sparkles} title="Temas Mais Conectores">
            <div className="space-y-3">
              {topTags.map((tag) => (
                <div className="space-y-1" key={tag.name}>
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>{tag.name}</span>
                    <span className="text-slate-400">{Math.round(tag.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, tag.value * 3)}%`, backgroundColor: tag.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        ) : null}

        <Card>
          <div className="flex items-center gap-2 text-slate-100">
            <Lightbulb className="size-4 text-yellow-300" />
            <h3 className="font-medium">Alertas e Oportunidades</h3>
          </div>
          <div className="mt-4 space-y-3">
            {highlightedAlerts.map((alert) => (
              <AlertItem alert={alert} key={alert.id} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-slate-100">
            <Sparkles className="size-4 text-sky-300" />
            <h3 className="font-medium">Projetos Sugeridos</h3>
          </div>
          <div className="mt-4 space-y-3">
            {lens.projects.slice(0, 4).map((project) => (
              <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-3" key={project.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{project.title}</p>
                  <Badge>{formatStrength(project.strength)}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{project.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.subjects.map((subject) => (
                    <Badge className="text-[10px] tracking-[0.18em]" key={subject}>
                      {subject}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SummaryStrip({
  lens,
  selectedEntity,
}: {
  lens: DashboardLensData;
  selectedEntity: SelectedEntity | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card className="rounded-[24px] p-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Teachers</p>
        <p className="mt-2 text-2xl font-semibold text-white">{lens.teachers.length}</p>
      </Card>
      <Card className="rounded-[24px] p-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Docs</p>
        <p className="mt-2 text-2xl font-semibold text-white">{lens.documents.length}</p>
      </Card>
      <Card className="rounded-[24px] p-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Selected</p>
        <p className="mt-2 text-sm font-semibold text-white">
          {selectedEntity ? selectedEntity.type.toUpperCase() : "Nenhum"}
        </p>
      </Card>
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2 text-slate-100">
        <Icon className="size-4 text-sky-300" />
        <h3 className="font-medium">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function AlertItem({ alert }: { alert: InsightAlert }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-white">{alert.title}</p>
        <Badge className={severityClass(alert.severity)}>{alert.severity}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{alert.description}</p>
    </div>
  );
}

function severityClass(severity: InsightAlert["severity"]) {
  if (severity === "critical" || severity === "high") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  if (severity === "medium") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-50";
  return "border-sky-300/20 bg-sky-300/10 text-sky-50";
}

function panelTitle(mode: ViewMode) {
  if (mode === "overview") return "Sinais de Missão";
  if (mode === "students") return "Leitura de Estudantes";
  if (mode === "classes") return "Pulso das Turmas";
  if (mode === "teachers") return "Rede Docente";
  if (mode === "schedule") return "Ritmo do Horário";
  if (mode === "insights") return "Motor de Alertas";
  return "Radar Interdisciplinar";
}
