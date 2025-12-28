"use client";

import { LAYOUT } from "@/lib/constants";
import SystemStatsPanel from "./panels/SystemStatsPanel";
import WeatherPanel from "./panels/WeatherPanel";
import CameraPanel from "./panels/CameraPanel";
import UptimePanel from "./panels/UptimePanel";

export default function LeftRail() {
  return (
    <div
      className="bg-panel-surface border-r border-border p-3 overflow-y-auto"
      style={{ width: `${LAYOUT.LEFT_RAIL_WIDTH}px` }}
    >
      <div className="flex flex-col gap-3">
        <SystemStatsPanel />
        <WeatherPanel />
        <CameraPanel />
        <UptimePanel />
      </div>
    </div>
  );
}

