"use client";

import { useState, useEffect } from "react";
import { LAYOUT } from "@/lib/constants";
import { useEventBus, useEmitEvent } from "@/lib/events/hooks";
import { useHudStore } from "@/lib/state/hudStore";
import { extractConversation, downloadTranscript } from "@/lib/utils/transcript";
import type { ZipEvent } from "@/lib/events/types";
import ChatStream from "./chat/ChatStream";

export default function RightChat() {
  const [events, setEvents] = useState<ZipEvent[]>([]);
  const { resetSession } = useHudStore();
  const emit = useEmitEvent();

  useEventBus((event: ZipEvent) => {
    if (event.type === "chat.message") {
      setEvents((prev) => [...prev, event]);
    }
  });

  const handleClear = () => {
    setEvents([]);
    resetSession();
    // Emit clear event so ChatStream can clear its messages
    emit({
      type: "chat.clear",
      ts: Date.now(),
    });
  };

  const handleExtract = () => {
    const { json, text } = extractConversation(events);
    downloadTranscript(json, text);
  };

  return (
    <div
      className="bg-panel-surface border-l border-border flex flex-col h-full"
      style={{ width: `${LAYOUT.RIGHT_RAIL_WIDTH}px` }}
    >
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-text-primary text-sm font-semibold uppercase tracking-wide">
          Conversation
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-md bg-panel-surface-2 hover:bg-panel-surface transition-colors"
            aria-label="Clear conversation"
          >
            Clear
          </button>
          <button
            onClick={handleExtract}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary border border-border rounded-md bg-panel-surface-2 hover:bg-panel-surface transition-colors"
            aria-label="Extract conversation"
          >
            Extract Conversation
          </button>
        </div>
      </div>
      <ChatStream />
    </div>
  );
}

