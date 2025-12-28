"use client";

import { LAYOUT } from "@/lib/constants";
import { usePanelUpdates } from "@/hooks/usePanelUpdates";
import TopBar from "./TopBar";
import LeftRail from "./LeftRail";
import CenterCore from "./CenterCore";
import RightChat from "./RightChat";

export default function HudShell() {
  usePanelUpdates();

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden" style={{ height: `calc(100vh - ${LAYOUT.TOP_BAR_HEIGHT}px)` }}>
        <LeftRail />
        <div className="flex-1 flex items-center justify-center">
          <CenterCore />
        </div>
        <RightChat />
      </div>
    </div>
  );
}

