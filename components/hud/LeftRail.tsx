"use client";

import { LAYOUT, PROJECTOR_LAYOUT } from "@/lib/constants";
import { useProjector } from "@/lib/projector/projector-provider";
import SystemStatsPanel from "./panels/SystemStatsPanel";
import WeatherPanel from "./panels/WeatherPanel";
import CameraPanel from "./panels/CameraPanel";
import HoloFaceDiagnosticPanel from "./panels/HoloFaceDiagnosticPanel";

export default function LeftRail() {
  const { isProjectorMode } = useProjector();
  const railWidth = isProjectorMode ? PROJECTOR_LAYOUT.LEFT_RAIL_WIDTH : LAYOUT.LEFT_RAIL_WIDTH;

  return (
    <div
      className={`bg-panel-surface border-r border-border p-3 ${isProjectorMode ? "overflow-y-visible" : "overflow-y-auto"}`}
      style={{ width: `${railWidth}px` }}
    >
      <div className="flex flex-col gap-3">
        <SystemStatsPanel />
        <WeatherPanel />
        <CameraPanel />
        <HoloFaceDiagnosticPanel />
      </div>
    </div>
  );
}

