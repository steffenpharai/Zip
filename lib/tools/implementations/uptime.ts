// Server-side uptime tracking
let serverStartTime: number | null = null;
let sessionCount = 0;

if (typeof window === "undefined") {
  // Server-side initialization
  serverStartTime = Date.now();
}

export function initializeUptime() {
  if (serverStartTime === null) {
    serverStartTime = Date.now();
  }
  sessionCount++;
}

export function getServerStartTime(): number {
  if (serverStartTime === null) {
    serverStartTime = Date.now();
  }
  return serverStartTime;
}

export async function getUptime(input: {
  sessionStartTime?: number;
  commandsCount?: number;
}): Promise<{
  runningSeconds: number;
  sessionCount: number;
  commandsCount: number;
  loadLabel: string;
  loadPercent: number;
  sessionTimeLabel: string;
}> {
  const now = Date.now();
  const startTime = getServerStartTime();
  const runningSeconds = Math.floor((now - startTime) / 1000);

  const sessionStart = input.sessionStartTime || now;
  const sessionSeconds = Math.floor((now - sessionStart) / 1000);

  // Calculate load (simplified: based on commands per minute)
  const commandsCount = input.commandsCount || 0;
  const minutesRunning = runningSeconds / 60;
  const commandsPerMinute = minutesRunning > 0 ? commandsCount / minutesRunning : 0;
  const loadPercent = Math.min(100, (commandsPerMinute / 10) * 100); // Normalize to 10 commands/min = 100%

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }

  return {
    runningSeconds,
    sessionCount,
    commandsCount,
    loadLabel: `${Math.round(loadPercent)}%`,
    loadPercent: Math.round(loadPercent),
    sessionTimeLabel: formatDuration(sessionSeconds),
  };
}

