// Server-side system stats (for API routes)
// Returns realistic mock values since server doesn't have access to browser APIs

let lastCpuCheck = Date.now();
let cpuWorkTime = 0;
let cpuIdleTime = 0;

function approximateCpuUsage(): number {
  const now = Date.now();
  const elapsed = now - lastCpuCheck;
  lastCpuCheck = now;

  // Simulate work
  const workTime = Math.random() * 10; // Random work time
  cpuWorkTime += workTime;
  cpuIdleTime += elapsed - workTime;

  const totalTime = cpuWorkTime + cpuIdleTime;
  if (totalTime === 0) return 25;

  const cpuPercent = (cpuWorkTime / totalTime) * 100;

  // Decay over time
  cpuWorkTime *= 0.9;
  cpuIdleTime *= 0.9;

  // Clamp between 10% and 85%
  return Math.max(10, Math.min(85, cpuPercent));
}

export async function getSystemStats(): Promise<{
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  cpuLabel: string;
  memLabel: string;
  diskLabel: string;
}> {
  const cpuPercent = approximateCpuUsage();
  
  // Realistic mock values
  const ramTotalGb = 16;
  const baseRamUsed = ramTotalGb * 0.45;
  const variation = (Math.sin(Date.now() / 10000) * 0.1 + 1) * baseRamUsed;
  const ramUsedGb = Math.min(variation, ramTotalGb * 0.9);

  const diskTotalGb = 512;
  const baseDiskUsed = 256;
  const diskVariation = (Math.sin(Date.now() / 15000) * 0.05 + 1) * baseDiskUsed;
  const diskUsedGb = Math.min(diskVariation, diskTotalGb * 0.95);

  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    ramUsedGb: Math.round(ramUsedGb * 100) / 100,
    ramTotalGb: Math.round(ramTotalGb * 100) / 100,
    diskUsedGb: Math.round(diskUsedGb * 100) / 100,
    diskTotalGb: Math.round(diskTotalGb * 100) / 100,
    cpuLabel: `${Math.round(cpuPercent)}%`,
    memLabel: `${Math.round(ramUsedGb)}/${Math.round(ramTotalGb)} GB`,
    diskLabel: `${Math.round(diskUsedGb)}/${Math.round(diskTotalGb)} GB`,
  };
}

