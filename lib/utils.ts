import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { ConnectionStrength, GradeKey, SharedTagScore } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

export function pickTopTags(tags: SharedTagScore[], limit = 3) {
  return [...tags].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function formatGradeLabel(grade: GradeKey) {
  if (grade === "all") return "Toda a escola";
  if (grade === "maker") return "Maker";
  if (grade === "other") return "Outras séries";
  return `${grade}º ano`;
}

export function formatStrength(strength: ConnectionStrength) {
  if (strength === "strong") return "Forte";
  if (strength === "medium") return "Média";
  return "Emergente";
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function groupBy<T, K extends string | number>(
  values: T[],
  getKey: (value: T) => K,
) {
  return values.reduce<Record<K, T[]>>((accumulator, value) => {
    const key = getKey(value);
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(value);
    return accumulator;
  }, {} as Record<K, T[]>);
}

export function humanizeSubjectCode(code: string) {
  return code.replace(/\s+/g, " ").trim();
}

export function byScoreDesc<T extends { score: number }>(a: T, b: T) {
  return b.score - a.score;
}

