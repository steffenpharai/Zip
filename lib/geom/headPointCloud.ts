import { Vector3 } from "three";

export interface PointMetadata {
  region: "face" | "eye_left" | "eye_right" | "mouth" | "nose" | "back";
  intensityMultiplier: number;
}

// Seeded RNG for deterministic generation
function seededRNG(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// Check if point is in a feature region (using normalized coordinates)
function getFeatureRegion(
  point: Vector3,
  radiusX: number,
  radiusY: number,
  radiusZ: number
): PointMetadata["region"] {
  // Normalize coordinates to [-1..1] space
  const nx = point.x / radiusX;
  const ny = point.y / radiusY;
  const nz = point.z / radiusZ;
  
  // Check if point is in back region first
  if (nz < -0.05) {
    return "back";
  }
  
  // Left eye region (normalized coordinates)
  if (nx < -0.15 && nx > -0.55 && ny > 0.10 && ny < 0.45 && nz > 0.35) {
    return "eye_left";
  }
  
  // Right eye region (normalized coordinates)
  if (nx > 0.15 && nx < 0.55 && ny > 0.10 && ny < 0.45 && nz > 0.35) {
    return "eye_right";
  }
  
  // Nose region (normalized coordinates, most forward)
  if (Math.abs(nx) < 0.18 && ny > -0.05 && ny < 0.35 && nz > 0.55) {
    return "nose";
  }
  
  // Mouth region (normalized coordinates)
  if (Math.abs(nx) < 0.40 && ny > -0.55 && ny < -0.15 && nz > 0.30) {
    return "mouth";
  }
  
  // Default to face region
  return "face";
}

// Get intensity multiplier based on region
function getIntensityMultiplier(region: PointMetadata["region"]): number {
  switch (region) {
    case "eye_left":
    case "eye_right":
      return 1.8; // Brighter for eyes
    case "mouth":
      return 1.4; // Medium for mouth
    case "nose":
      return 1.2;
    case "face":
      return 1.0;
    case "back":
      return 0.7; // Dimmer for back
    default:
      return 1.0;
  }
}

// Generate point on ellipsoid surface
function generateEllipsoidPoint(
  rng: () => number,
  radiusX: number,
  radiusY: number,
  radiusZ: number
): Vector3 {
  // Spherical coordinates with rejection sampling for ellipsoid
  const u = rng();
  const v = rng();
  const theta = u * 2 * Math.PI; // Azimuth
  const phi = Math.acos(2 * v - 1); // Elevation
  
  const x = radiusX * Math.sin(phi) * Math.cos(theta);
  const y = radiusY * Math.sin(phi) * Math.sin(theta);
  const z = radiusZ * Math.cos(phi);
  
  return new Vector3(x, y, z);
}

// Feature region density multipliers
const REGION_DENSITY: Record<PointMetadata["region"], number> = {
  eye_left: 3.0, // Higher density for eyes
  eye_right: 3.0,
  mouth: 2.0, // Medium density for mouth
  nose: 1.5,
  face: 1.0,
  back: 0.5, // Lower density for back
};

export function generateHeadPointCloud(
  density: number = 2500,
  seed?: number
): { positions: Vector3[]; metadata: PointMetadata[] } {
  const rng = seed !== undefined ? seededRNG(seed) : () => Math.random();
  const positions: Vector3[] = [];
  const metadata: PointMetadata[] = [];
  
  // Head ellipsoid dimensions (slightly elongated for human head shape)
  const radiusX = 0.5; // Width
  const radiusY = 0.65; // Height (taller)
  const radiusZ = 0.55; // Depth
  
  // Generate points with rejection sampling
  // We'll generate more candidates than needed to account for rejection
  const targetPoints = density;
  let attempts = 0;
  const maxAttempts = targetPoints * 10; // Safety limit
  
  while (positions.length < targetPoints && attempts < maxAttempts) {
    attempts++;
    
    // Generate candidate point
    const point = generateEllipsoidPoint(rng, radiusX, radiusY, radiusZ);
    
    // Normalize coordinates for region detection and facial bias
    const nx = point.x / radiusX;
    const ny = point.y / radiusY;
    const nz = point.z / radiusZ;
    
    const region = getFeatureRegion(point, radiusX, radiusY, radiusZ);
    
    // Facial plane bias: weight acceptance towards front hemisphere
    const frontBias = Math.max(0, (nz + 1) * 0.5); // 0..1, where nz ∈ [-1..1]
    const frontBiasProb = 0.35 + 0.65 * Math.pow(frontBias, 1.8);
    
    // Rejection sampling based on region density
    const densityMultiplier = REGION_DENSITY[region];
    const densityProb = Math.min(densityMultiplier / 3.0, 1.0); // Normalize
    
    // Combine facial bias and density probability
    const acceptProbability = Math.min(frontBiasProb * densityProb, 1.0);
    
    if (rng() < acceptProbability || positions.length < targetPoints * 0.1) {
      // Accept point (always accept first 10% to ensure minimum coverage)
      positions.push(point);
      metadata.push({
        region,
        intensityMultiplier: getIntensityMultiplier(region),
      });
    }
  }
  
  // If we didn't get enough points, fill with uniform distribution
  while (positions.length < targetPoints) {
    const point = generateEllipsoidPoint(rng, radiusX, radiusY, radiusZ);
    const region = getFeatureRegion(point, radiusX, radiusY, radiusZ);
    positions.push(point);
    metadata.push({
      region,
      intensityMultiplier: getIntensityMultiplier(region),
    });
  }
  
  return { positions, metadata };
}

