"use client";

/**
 * ConnectionStatus - Robot bridge connection status display
 * 
 * Shows connection state, port info, and uptime.
 */

import type { RobotConnectionState, RobotHealthResponse } from "@/lib/robot/types";

interface ConnectionStatusProps {
  connection: RobotConnectionState;
  health: RobotHealthResponse | null;
  onReconnect: () => void;
}

export default function ConnectionStatus({
  connection,
  health,
  onReconnect,
}: ConnectionStatusProps) {
  function getConnectionColor(state: RobotConnectionState): string {
    switch (state) {
      case "ready":
        return "bg-online-green";
      case "connected":
      case "handshaking":
        return "bg-yellow-500";
      case "connecting":
        return "bg-accent-cyan animate-pulse";
      case "error":
        return "bg-red-500";
      default:
        return "bg-text-muted";
    }
  }

  function getConnectionLabel(state: RobotConnectionState): string {
    switch (state) {
      case "ready":
        return "Ready";
      case "connected":
        return "Connected";
      case "handshaking":
        return "Handshaking";
      case "connecting":
        return "Connecting...";
      case "error":
        return "Error";
      default:
        return "Disconnected";
    }
  }

  function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
      {/* Connection Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${getConnectionColor(connection)}`} />
          <div>
            <div className="text-text-primary font-medium">
              {getConnectionLabel(connection)}
            </div>
            <div className="text-text-muted text-xs">
              Bridge Connection
            </div>
          </div>
        </div>
        <button
          onClick={onReconnect}
          disabled={connection === "connecting"}
          className="px-3 py-1.5 text-xs bg-panel-surface-2 border border-border rounded hover:border-accent-cyan/50 hover:text-accent-cyan transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connection === "connecting" ? "Connecting..." : "Reconnect"}
        </button>
      </div>

      {/* Connection Details */}
      {health && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Port</div>
            <div className="text-text-primary font-mono text-sm">
              {health.port || "Auto-detect"}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Baud</div>
            <div className="text-text-primary font-mono text-sm">
              {health.baud}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Uptime</div>
            <div className="text-text-primary font-mono text-sm">
              {formatUptime(health.uptime)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Resets</div>
            <div className="text-text-primary font-mono text-sm">
              {health.resetsSeen}
            </div>
          </div>
        </div>
      )}

      {/* Traffic Stats */}
      {health && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">RX</div>
            <div className="text-online-green font-mono text-sm">
              {formatBytes(health.rxBytes)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">TX</div>
            <div className="text-accent-cyan font-mono text-sm">
              {formatBytes(health.txBytes)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-xs uppercase tracking-wide">Pending</div>
            <div className="text-text-primary font-mono text-sm">
              {health.pendingQueueDepth}
            </div>
          </div>
        </div>
      )}

      {/* Status indicators */}
      {health && (
        <div className="flex gap-4 pt-3 border-t border-border/50 text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health.serialOpen ? "bg-online-green" : "bg-red-500"}`} />
            <span className="text-text-muted">Serial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health.ready ? "bg-online-green" : "bg-yellow-500"}`} />
            <span className="text-text-muted">Firmware</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health.streaming ? "bg-accent-cyan animate-pulse" : "bg-text-muted"}`} />
            <span className="text-text-muted">Streaming</span>
          </div>
        </div>
      )}
    </div>
  );
}

