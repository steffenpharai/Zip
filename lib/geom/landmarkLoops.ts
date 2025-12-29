import { Vector3 } from "three";

/**
 * Generate landmark loops (eye rings and mouth curve) as separate bright line geometry.
 * These provide instant facial recognition cues.
 */

export interface LandmarkLoop {
  positions: Float32Array;
  intensity: number;
}

/**
 * Generate eye ring points on the ellipsoid surface
 */
function generateEyeRing(
  centerNormalized: Vector3,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  pointCount: number = 20
): Vector3[] {
  const points: Vector3[] = [];
  const radius = 0.12; // Normalized radius for eye ring
  
  // Convert normalized center to world space
  const centerWorld = new Vector3(
    centerNormalized.x * radiusX,
    centerNormalized.y * radiusY,
    centerNormalized.z * radiusZ
  );
  
  // Generate points in a circle, then project to ellipsoid surface
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    
    // Create point in local tangent plane (X-Y plane at eye level)
    const localX = Math.cos(angle) * radius;
    const localY = Math.sin(angle) * radius;
    
    // Project to ellipsoid surface
    // We'll create a point near the center and project it outward
    const candidate = new Vector3(
      centerWorld.x + localX * radiusX,
      centerWorld.y + localY * radiusY,
      centerWorld.z
    );
    
    // Project to ellipsoid surface
    const normalized = new Vector3(
      candidate.x / radiusX,
      candidate.y / radiusY,
      candidate.z / radiusZ
    );
    
    // Normalize to ellipsoid surface
    const len = Math.sqrt(
      normalized.x * normalized.x +
      normalized.y * normalized.y +
      normalized.z * normalized.z
    );
    
    if (len > 0) {
      const scale = 1.0 / len;
      points.push(
        new Vector3(
          normalized.x * scale * radiusX,
          normalized.y * scale * radiusY,
          normalized.z * scale * radiusZ
        )
      );
    } else {
      points.push(centerWorld.clone());
    }
  }
  
  return points;
}

/**
 * Generate mouth curve points on the ellipsoid surface
 */
function generateMouthCurve(
  centerNormalized: Vector3,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  pointCount: number = 16
): Vector3[] {
  const points: Vector3[] = [];
  const width = 0.35; // Normalized width for mouth
  const height = 0.08; // Normalized height for mouth curve
  
  // Convert normalized center to world space
  const centerWorld = new Vector3(
    centerNormalized.x * radiusX,
    centerNormalized.y * radiusY,
    centerNormalized.z * radiusZ
  );
  
  // Generate points in an arc shape
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1); // 0 to 1
    const x = (t - 0.5) * 2 * width; // -width to +width
    const y = -Math.abs(Math.sin(t * Math.PI)) * height; // Arc downward
    
    // Create point in local space
    const candidate = new Vector3(
      centerWorld.x + x * radiusX,
      centerWorld.y + y * radiusY,
      centerWorld.z
    );
    
    // Project to ellipsoid surface
    const normalized = new Vector3(
      candidate.x / radiusX,
      candidate.y / radiusY,
      candidate.z / radiusZ
    );
    
    // Normalize to ellipsoid surface
    const len = Math.sqrt(
      normalized.x * normalized.x +
      normalized.y * normalized.y +
      normalized.z * normalized.z
    );
    
    if (len > 0) {
      const scale = 1.0 / len;
      points.push(
        new Vector3(
          normalized.x * scale * radiusX,
          normalized.y * scale * radiusY,
          normalized.z * scale * radiusZ
        )
      );
    } else {
      points.push(centerWorld.clone());
    }
  }
  
  return points;
}

/**
 * Convert array of Vector3 points to Float32Array for line geometry
 */
function pointsToLinePositions(points: Vector3[]): Float32Array {
  const positions: number[] = [];
  
  // Create line segments connecting consecutive points
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length]; // Loop back to first point
    
    positions.push(
      current.x, current.y, current.z,
      next.x, next.y, next.z
    );
  }
  
  return new Float32Array(positions);
}

/**
 * Generate landmark loops (eye rings and mouth curve) for the wiremesh head.
 * 
 * @param radiusX - Ellipsoid X radius (width)
 * @param radiusY - Ellipsoid Y radius (height)
 * @param radiusZ - Ellipsoid Z radius (depth)
 * @returns Object containing eye and mouth landmark loops with positions and intensity
 */
export function generateLandmarkLoops(
  radiusX: number,
  radiusY: number,
  radiusZ: number
): {
  eyeLeft: LandmarkLoop;
  eyeRight: LandmarkLoop;
  mouth: LandmarkLoop;
} {
  // Normalized center positions (in [-1..1] space)
  const leftEyeCenter = new Vector3(-0.35, 0.25, 0.45);
  const rightEyeCenter = new Vector3(0.35, 0.25, 0.45);
  const mouthCenter = new Vector3(0, -0.35, 0.35);
  
  // Generate eye rings
  const leftEyePoints = generateEyeRing(leftEyeCenter, radiusX, radiusY, radiusZ, 20);
  const rightEyePoints = generateEyeRing(rightEyeCenter, radiusX, radiusY, radiusZ, 20);
  
  // Generate mouth curve
  const mouthPoints = generateMouthCurve(mouthCenter, radiusX, radiusY, radiusZ, 16);
  
  // Convert to line geometry format
  const eyeLeftPositions = pointsToLinePositions(leftEyePoints);
  const eyeRightPositions = pointsToLinePositions(rightEyePoints);
  const mouthPositions = pointsToLinePositions(mouthPoints);
  
  // Higher intensity for landmarks (2.0-2.5× base intensity)
  const landmarkIntensity = 2.2;
  
  return {
    eyeLeft: {
      positions: eyeLeftPositions,
      intensity: landmarkIntensity,
    },
    eyeRight: {
      positions: eyeRightPositions,
      intensity: landmarkIntensity,
    },
    mouth: {
      positions: mouthPositions,
      intensity: landmarkIntensity,
    },
  };
}

