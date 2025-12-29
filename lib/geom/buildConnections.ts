import { Vector3 } from "three";

export interface ConnectionMetadata {
  strength: number; // 0-1, based on distance
  phase: number; // 0-1, for data flow animation
  seed: number; // 0-1, for flicker animation
}

// Simple spatial hash grid implementation
class SpatialHashGrid {
  private grid: Map<string, number[]> = new Map();
  private cellSize: number;
  
  constructor(points: Vector3[], cellSize: number) {
    this.cellSize = cellSize;
    
    // Index all points into grid cells
    points.forEach((point, index) => {
      const key = this.getCellKey(point);
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      this.grid.get(key)!.push(index);
    });
  }
  
  private getCellKey(point: Vector3): string {
    const x = Math.floor(point.x / this.cellSize);
    const y = Math.floor(point.y / this.cellSize);
    const z = Math.floor(point.z / this.cellSize);
    return `${x},${y},${z}`;
  }
  
  // Get all points in cell and adjacent cells (27 cells total in 3D)
  query(point: Vector3, radius: number): number[] {
    const results: number[] = [];
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);
    
    // Check current cell and all 26 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
          const cellPoints = this.grid.get(key);
          if (cellPoints) {
            results.push(...cellPoints);
          }
        }
      }
    }
    
    return results;
  }
}

// Seeded RNG for deterministic phase/seed generation
function seededRNG(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function buildConnections(
  points: Vector3[],
  threshold: number = 0.2,
  maxNeighbors: number = 8,
  seed: number = 12345
): {
  linePositions: Float32Array;
  lineMeta: Float32Array; // [strength, phase, seed] per edge
} {
  const rng = seededRNG(seed);
  
  // Create spatial hash grid with cell size slightly larger than threshold
  // This ensures we only need to check adjacent cells
  const cellSize = threshold * 1.5;
  const grid = new SpatialHashGrid(points, cellSize);
  
  const lineSegments: number[] = []; // Flattened [x1, y1, z1, x2, y2, z2, ...]
  const metadata: number[] = []; // [strength, phase, seed] per edge
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Query spatial grid for potential neighbors
    const candidateIndices = grid.query(point, threshold);
    
    // Filter to actual neighbors within threshold and exclude self
    const neighbors: Array<{ index: number; distance: number }> = [];
    
    for (const j of candidateIndices) {
      if (i === j) continue;
      
      const other = points[j];
      const distance = point.distanceTo(other);
      
      if (distance <= threshold) {
        neighbors.push({ index: j, distance });
      }
    }
    
    // Sort by distance and cap at maxNeighbors
    neighbors.sort((a, b) => a.distance - b.distance);
    const selectedNeighbors = neighbors.slice(0, maxNeighbors);
    
    // Create line segments for each neighbor
    for (const neighbor of selectedNeighbors) {
      const other = points[neighbor.index];
      
      // Add line segment (both directions to avoid duplicates, but we'll dedupe later)
      // For now, only add if i < j to avoid duplicates
      if (i < neighbor.index) {
        lineSegments.push(
          point.x, point.y, point.z,
          other.x, other.y, other.z
        );
        
        // Calculate strength (inverse of distance, normalized)
        const strength = 1.0 - (neighbor.distance / threshold);
        
        // Generate phase and seed for animation
        const phase = rng();
        const edgeSeed = rng();
        
        metadata.push(strength, phase, edgeSeed);
      }
    }
  }
  
  return {
    linePositions: new Float32Array(lineSegments),
    lineMeta: new Float32Array(metadata),
  };
}

