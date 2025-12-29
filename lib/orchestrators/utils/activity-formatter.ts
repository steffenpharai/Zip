/**
 * Activity Formatter Utility
 * 
 * Formats activity messages for display in the UI
 */

import type { BrainActivityEvent } from "@/lib/events/types";

/**
 * Format activity message for main status display
 */
export function formatActivityMessage(activity: BrainActivityEvent["activity"]): string {
  switch (activity.action) {
    case "node.enter":
      if (activity.node) {
        const nodeNames: Record<string, string> = {
          input: "Processing input",
          memory: "Checking memory",
          router: "Analyzing request",
          direct: "Direct tool calling",
          research: "Research mode",
          workflow: "Workflow mode",
          finalize: "Finalizing response",
        };
        return nodeNames[activity.node] || `Entering ${activity.node}...`;
      }
      return "Processing...";

    case "node.exit":
      if (activity.node) {
        return `Completed ${activity.node}`;
      }
      return "Completed";

    case "tool.start":
      if (activity.tool) {
        const toolNames: Record<string, string> = {
          web_search: "Searching the web",
          fetch_url: "Fetching content",
          summarize_sources: "Summarizing sources",
          get_weather: "Getting weather",
          get_system_stats: "Getting system stats",
          analyze_image: "Analyzing image",
          doc_search: "Searching documents",
          doc_answer: "Answering from documents",
        };
        return toolNames[activity.tool] || `Executing ${activity.tool}...`;
      }
      return "Executing tool...";

    case "tool.complete":
      if (activity.tool) {
        return `Completed ${activity.tool}`;
      }
      return "Tool completed";

    case "llm.call":
      if (activity.llmModel) {
        return `Calling ${activity.llmModel}...`;
      }
      return "Calling LLM...";

    case "state.update":
      if (activity.stateChange) {
        return `Updating ${activity.stateChange.field}...`;
      }
      return "Updating state...";

    default:
      return "Processing...";
  }
}

/**
 * Format activity for compact timeline display
 */
export function formatActivityShort(activity: BrainActivityEvent["activity"]): string {
  switch (activity.action) {
    case "node.enter":
      return activity.node ? `→ ${activity.node}` : "→ node";
    case "node.exit":
      return activity.node ? `✓ ${activity.node}` : "✓ done";
    case "tool.start":
      return activity.tool ? `🔧 ${activity.tool}` : "🔧 tool";
    case "tool.complete":
      return activity.tool ? `✓ ${activity.tool}` : "✓ tool";
    case "llm.call":
      return activity.llmModel ? `🤖 ${activity.llmModel.split("-")[0]}` : "🤖 LLM";
    case "state.update":
      return activity.stateChange ? `📝 ${activity.stateChange.field}` : "📝 state";
    default:
      return "•";
  }
}

/**
 * Get activity icon/emoji
 */
export function getActivityIcon(activity: BrainActivityEvent["activity"]): string {
  switch (activity.action) {
    case "node.enter":
      return "→";
    case "node.exit":
      return "✓";
    case "tool.start":
      return "🔧";
    case "tool.complete":
      return "✓";
    case "llm.call":
      return "🤖";
    case "state.update":
      return "📝";
    default:
      return "•";
  }
}

