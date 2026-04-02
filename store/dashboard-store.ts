import { create } from "zustand";

import type { GradeKey, SelectedEntity, ViewMode } from "@/types";

interface DashboardState {
  activeGrade: GradeKey;
  activeMode: ViewMode;
  selectedEntity: SelectedEntity | null;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  setActiveGrade: (grade: GradeKey) => void;
  setActiveMode: (mode: ViewMode) => void;
  setSelectedEntity: (entity: SelectedEntity | null) => void;
  setFocusedNodeId: (nodeId: string | null) => void;
  setHoveredNodeId: (nodeId: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeGrade: "all",
  activeMode: "overview",
  selectedEntity: null,
  focusedNodeId: null,
  hoveredNodeId: null,
  setActiveGrade: (activeGrade) => set({ activeGrade, selectedEntity: null, focusedNodeId: null }),
  setActiveMode: (activeMode) => set({ activeMode, selectedEntity: null }),
  setSelectedEntity: (selectedEntity) => set({ selectedEntity }),
  setFocusedNodeId: (focusedNodeId) => set({ focusedNodeId }),
  setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
}));
