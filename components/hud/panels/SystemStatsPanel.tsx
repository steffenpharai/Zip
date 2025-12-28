"use client";

import { useState, useEffect } from "react";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";

interface SystemStats {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  cpuLabel: string;
  memLabel: string;
  diskLabel: string;
}

export default function SystemStatsPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "system") {
      setStats(event.payload as SystemStats);
    }
  });

  if (!stats) {
    return (
      <div
        className="bg-panel-surface-2 border border-border rounded-xl p-4"
        style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
      >
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
          System Stats
        </h4>
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        System Stats
      </h4>
      <div className="space-y-3">
        {/* CPU */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-text-primary text-xs">CPU</span>
            <span className="text-text-muted text-xs">{stats.cpuLabel}</span>
          </div>
          <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-cyan transition-all duration-300"
              style={{ width: `${stats.cpuPercent}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-text-primary text-xs">RAM</span>
            <span className="text-text-muted text-xs">{stats.memLabel}</span>
          </div>
          <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-cyan-2 transition-all duration-300"
              style={{
                width: `${(stats.ramUsedGb / stats.ramTotalGb) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Disk */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-text-primary text-xs">Disk</span>
            <span className="text-text-muted text-xs">{stats.diskLabel}</span>
          </div>
          <div className="h-2 bg-panel-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-cyan transition-all duration-300"
              style={{
                width: `${(stats.diskUsedGb / stats.diskTotalGb) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

