"use client";

import { useState } from "react";
import { useEventBus } from "@/lib/events/hooks";
import { useHudStore } from "@/lib/state/hudStore";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";

export default function CameraPanel() {
  const { state } = useHudStore();
  const [cameraState, setCameraState] = useState<{ enabled: boolean } | null>(
    null
  );

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "camera") {
      setCameraState(event.payload as { enabled: boolean });
    }
  });

  const enabled = cameraState?.enabled ?? state.cameraEnabled;

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        Camera
      </h4>
      <div className="flex items-center justify-center h-24 bg-panel-surface rounded-md border border-border">
        <div className="text-center">
          <div
            className={`w-3 h-3 rounded-full mx-auto mb-2 ${
              enabled ? "bg-online-green" : "bg-text-muted"
            }`}
          />
          <span className="text-text-muted text-sm">
            {enabled ? "Camera On" : "Camera Off"}
          </span>
        </div>
      </div>
    </div>
  );
}

