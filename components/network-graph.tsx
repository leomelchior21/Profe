"use client";

import { useEffect, useRef, useState } from "react";

import { motion } from "framer-motion";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { NetworkLink, NetworkNode } from "@/types";

interface NetworkGraphProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  onHoverNode: (nodeId: string | null) => void;
  onSelectNode: (nodeId: string) => void;
}

interface SimNode extends SimulationNodeDatum, NetworkNode {}
type SimLink = Omit<NetworkLink, "source" | "target"> &
  SimulationLinkDatum<SimNode> & {
    source: string | SimNode;
    target: string | SimNode;
  };

export function NetworkGraph({
  nodes,
  links,
  focusedNodeId,
  hoveredNodeId,
  onHoverNode,
  onSelectNode,
}: NetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.width || !size.height || nodes.length === 0) return;

    const simulationNodes: SimNode[] = nodes.map((node) => ({
      ...node,
      x: size.width / 2 + (Math.random() - 0.5) * 40,
      y: size.height / 2 + (Math.random() - 0.5) * 40,
    }));

    const simulationLinks: SimLink[] = links.map((link) => ({
      ...link,
      source: link.source,
      target: link.target,
    }));

    const simulation = forceSimulation(simulationNodes)
      .force("charge", forceManyBody().strength(-140))
      .force(
        "link",
        forceLink<SimNode, SimLink>(simulationLinks)
          .id((node) => node.id)
          .distance((link) => (typeof link.target === "string" ? 110 : link.target.kind === "topic" ? 92 : 76))
          .strength(0.42),
      )
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .force(
        "collision",
        forceCollide<SimNode>().radius((node) => {
          if (node.kind === "topic") return 18;
          if (node.kind === "teacher") return 24;
          if (node.kind === "subject") return 22;
          return 20;
        }),
      )
      .stop();

    for (let tick = 0; tick < 220; tick += 1) {
      simulation.tick();
    }

    setPositions(
      Object.fromEntries(
        simulationNodes.map((node) => [
          node.id,
          {
            x: Math.max(28, Math.min(size.width - 28, node.x ?? size.width / 2)),
            y: Math.max(28, Math.min(size.height - 28, node.y ?? size.height / 2)),
          },
        ]),
      ),
    );

    simulation.stop();
  }, [links, nodes, size.height, size.width]);

  const activeNodeId = focusedNodeId ?? hoveredNodeId;
  const connectedNodeIds = new Set<string>();
  if (activeNodeId) {
    connectedNodeIds.add(activeNodeId);
    links.forEach((link) => {
      if (link.source === activeNodeId) connectedNodeIds.add(link.target);
      if (link.target === activeNodeId) connectedNodeIds.add(link.source);
    });
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]" ref={containerRef}>
      <motion.svg
        animate={{ opacity: 1 }}
        className="h-full w-full"
        initial={{ opacity: 0 }}
        viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
      >
        <defs>
          <filter height="220%" id="glow" width="220%" x="-60%" y="-60%">
            <feGaussianBlur result="blur" stdDeviation="3.5" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {links.map((link) => {
          const sourceId = link.source;
          const targetId = link.target;
          const source = positions[sourceId];
          const target = positions[targetId];
          if (!source || !target) return null;

          const dimmed = activeNodeId ? !connectedNodeIds.has(sourceId) || !connectedNodeIds.has(targetId) : false;

          return (
            <line
              key={link.id}
              filter="url(#glow)"
              opacity={dimmed ? 0.08 : Math.min(0.9, 0.16 + link.strength / 18)}
              stroke={link.color}
              strokeLinecap="round"
              strokeWidth={Math.max(1.4, Math.min(5.2, 1 + link.strength / 4))}
              x1={source.x}
              x2={target.x}
              y1={source.y}
              y2={target.y}
            />
          );
        })}

        {nodes.map((node) => {
          const point = positions[node.id];
          if (!point) return null;

          const dimmed = activeNodeId ? !connectedNodeIds.has(node.id) : false;
          const radius =
            node.kind === "teacher"
              ? 12
              : node.kind === "subject"
                ? 14
                : node.kind === "topic"
                  ? 10
                  : 11;

          return (
            <g
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              onMouseEnter={() => onHoverNode(node.id)}
              onMouseLeave={() => onHoverNode(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                fill={node.color}
                filter="url(#glow)"
                opacity={dimmed ? 0.2 : 0.95}
                r={radius}
                stroke={node.kind === "class" ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.2)"}
                strokeWidth={node.id === activeNodeId ? 2.5 : 1.2}
              />
              <text
                fill={dimmed ? "rgba(226,232,240,0.3)" : "rgba(226,232,240,0.92)"}
                fontFamily="var(--font-display)"
                fontSize={node.kind === "topic" ? 10 : 11.5}
                letterSpacing="0.08em"
                textAnchor="middle"
                x={point.x}
                y={point.y + radius + 16}
              >
                {node.shortLabel}
              </text>
            </g>
          );
        })}
      </motion.svg>

      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/55 px-3 py-1.5 text-[11px] uppercase tracking-[0.28em] text-slate-300">
        Living Knowledge Map
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 flex gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Turmas</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Docentes</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Temas</span>
      </div>
    </div>
  );
}
