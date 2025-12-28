"use client";

import { useState, useCallback } from "react";
import { useEmitEvent, useEventBus } from "@/lib/events/hooks";
import { useHudStore } from "@/lib/state/hudStore";
import { ZIP_MODES } from "@/lib/constants";
import { usePanelContext } from "./usePanelContext";
import type { UserContext } from "@/lib/context/types";
import type { ZipEvent } from "@/lib/events/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PendingConfirmation {
  tool: string;
  input: unknown;
  message: string;
  originalMessage: string;
  conversationHistory: Message[];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const emit = useEmitEvent();
  const { incrementCommand, setMode } = useHudStore();
  const contextData = usePanelContext();
  
  // Listen for clear events
  useEventBus((event: ZipEvent) => {
    if (event.type === "chat.clear") {
      setMessages([]);
      setPendingConfirmation(null);
      setStreamingMessageId(null);
    }
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);

      // Emit user message event
      emit({
        type: "chat.message",
        id: `msg-${Date.now()}`,
        role: "user",
        text,
        ts: Date.now(),
      });

      setLoading(true);
      setMode(ZIP_MODES.THINKING);
      incrementCommand();

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationHistory: messages,
            sessionState: {
              sessionStartTime: Date.now(),
              commandsCount: 1,
            },
            contextData: contextData,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get response");
        }

        // Handle SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let currentMessage = "";
        const messageId = `msg-${Date.now()}`;
        setStreamingMessageId(messageId);
        let firstDelta = true;

        let requiresConfirmationData: { tool: string; input: unknown; message: string } | null = null;
        let toolResultsData: Array<{ tool: string; result: unknown }> | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const [eventLine, dataLine] = line.split("\n");
            if (!eventLine.startsWith("event:") || !dataLine.startsWith("data:")) continue;

            const eventType = eventLine.substring(7).trim();
            const dataStr = dataLine.substring(6).trim();

            try {
              const data = JSON.parse(dataStr);

              if (eventType === "text") {
                // Stream text delta
                currentMessage += data.delta;
                
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                    updated[lastIndex] = {
                      ...updated[lastIndex],
                      content: currentMessage,
                    };
                  }
                  return updated;
                });

                // Emit streaming message event for real-time UI updates in ChatStream
                // Include messageId on first delta so ChatStream can track it
                emit({
                  type: "brain.stream",
                  delta: data.delta,
                  done: false,
                  ts: Date.now(),
                  messageId: firstDelta ? messageId : undefined,
                });
                
                if (firstDelta) {
                  firstDelta = false;
                }
              } else if (eventType === "activity") {
                // Emit activity event
                emit({
                  type: "brain.activity",
                  activity: data,
                  ts: Date.now(),
                });
              } else if (eventType === "confirmation") {
                requiresConfirmationData = data;
              } else if (eventType === "toolResults") {
                toolResultsData = data;
              } else if (eventType === "done") {
                // Streaming complete
                setStreamingMessageId(null);
                
                // Emit final message event only if we have content
                if (currentMessage.trim()) {
                  emit({
                    type: "chat.message",
                    id: messageId,
                    role: "assistant",
                    text: currentMessage,
                    ts: Date.now(),
                  });
                }

                // Handle confirmation requirement
                if (requiresConfirmationData) {
                  setPendingConfirmation({
                    tool: requiresConfirmationData.tool,
                    input: requiresConfirmationData.input,
                    message: requiresConfirmationData.message,
                    originalMessage: text,
                    conversationHistory: [...messages, userMessage, { ...assistantMessage, content: currentMessage }],
                  });
                  setMode(ZIP_MODES.IDLE);
                  return;
                }

                // Clear any pending confirmation
                setPendingConfirmation(null);

                // Handle tool results
                if (toolResultsData && toolResultsData.length > 0) {
                  for (const toolResult of toolResultsData) {
                    // Map tool results to panel updates
                    if (toolResult.tool === "get_system_stats") {
                      emit({
                        type: "panel.update",
                        panel: "system",
                        payload: toolResult.result,
                        ts: Date.now(),
                      });
                    } else if (toolResult.tool === "get_weather") {
                      emit({
                        type: "panel.update",
                        panel: "weather",
                        payload: toolResult.result,
                        ts: Date.now(),
                      });
                    } else if (toolResult.tool === "get_uptime") {
                      emit({
                        type: "panel.update",
                        panel: "uptime",
                        payload: toolResult.result,
                        ts: Date.now(),
                      });
                    } else if (toolResult.tool.startsWith("set_vrm_") || toolResult.tool === "reset_vrm_pose") {
                      // VRM control tools - show toast notification
                      const toolName = toolResult.tool.replace("set_vrm_", "").replace("_", " ");
                      const success = (toolResult.result as any)?.success !== false;
                      emit({
                        type: "toast",
                        level: success ? "info" : "error",
                        text: success 
                          ? `VRM ${toolName} executed successfully`
                          : `VRM ${toolName} failed: ${(toolResult.result as any)?.error || "Unknown error"}`,
                        ts: Date.now(),
                      });
                    } else if (toolResult.tool === "get_vrm_info") {
                      // VRM info query - show toast with summary
                      const info = toolResult.result as any;
                      if (info?.availableBones && info?.availableBlendShapes) {
                        emit({
                          type: "toast",
                          level: "info",
                          text: `VRM Info: ${info.availableBones.length} bones, ${info.availableBlendShapes.length} expressions available`,
                          ts: Date.now(),
                        });
                      }
                    }
                  }
                }

                setMode(ZIP_MODES.IDLE);
              } else if (eventType === "error") {
                throw new Error(data.message || "Streaming error");
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError);
            }
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        setMode(ZIP_MODES.ERROR);
        emit({
          type: "toast",
          level: "error",
          text: "Failed to get response from assistant",
          ts: Date.now(),
        });
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, emit, incrementCommand, setMode, contextData]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingConfirmation(null);
  }, []);

  const confirmAction = useCallback(
    async (confirmed: boolean) => {
      if (!pendingConfirmation) return;

      setLoading(true);
      setMode(ZIP_MODES.THINKING);

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: pendingConfirmation.originalMessage,
            conversationHistory: pendingConfirmation.conversationHistory,
            confirmation: {
              tool: pendingConfirmation.tool,
              input: pendingConfirmation.input,
              confirmed,
            },
            contextData: contextData,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to get response");
        }

        const data = await response.json();
        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Emit assistant message event
        emit({
          type: "chat.message",
          id: `msg-${Date.now()}`,
          role: "assistant",
          text: data.response,
          ts: Date.now(),
        });

        // Handle tool results
        if (data.toolResults && data.toolResults.length > 0) {
          for (const toolResult of data.toolResults) {
            // Map tool results to panel updates
            if (toolResult.tool === "get_system_stats") {
              emit({
                type: "panel.update",
                panel: "system",
                payload: toolResult.result,
                ts: Date.now(),
              });
            } else if (toolResult.tool === "get_weather") {
              emit({
                type: "panel.update",
                panel: "weather",
                payload: toolResult.result,
                ts: Date.now(),
              });
            } else if (toolResult.tool === "get_uptime") {
              emit({
                type: "panel.update",
                panel: "uptime",
                payload: toolResult.result,
                ts: Date.now(),
              });
            } else if (toolResult.tool.startsWith("set_vrm_") || toolResult.tool === "reset_vrm_pose") {
              // VRM control tools - show toast notification
              const toolName = toolResult.tool.replace("set_vrm_", "").replace("_", " ");
              const success = (toolResult.result as any)?.success !== false;
              emit({
                type: "toast",
                level: success ? "info" : "error",
                text: success 
                  ? `VRM ${toolName} executed successfully`
                  : `VRM ${toolName} failed: ${(toolResult.result as any)?.error || "Unknown error"}`,
                ts: Date.now(),
              });
            } else if (toolResult.tool === "get_vrm_info") {
              // VRM info query - show toast with summary
              const info = toolResult.result as any;
              if (info?.availableBones && info?.availableBlendShapes) {
                emit({
                  type: "toast",
                  level: "info",
                  text: `VRM Info: ${info.availableBones.length} bones, ${info.availableBlendShapes.length} expressions available`,
                  ts: Date.now(),
                });
              }
            }
          }
        }

        setPendingConfirmation(null);
        setMode(ZIP_MODES.IDLE);
      } catch (error) {
        console.error("Confirmation error:", error);
        setMode(ZIP_MODES.ERROR);
        emit({
          type: "toast",
          level: "error",
          text: "Failed to process confirmation",
          ts: Date.now(),
        });
      } finally {
        setLoading(false);
      }
    },
    [pendingConfirmation, contextData, emit, setMode]
  );

  return {
    messages,
    loading,
    sendMessage,
    clearMessages,
    pendingConfirmation,
    confirmAction,
  };
}

