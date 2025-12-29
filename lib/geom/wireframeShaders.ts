import { ShaderMaterial } from "three";
import * as THREE from "three";

// Point sprite shader for wireframe dots
export function createPointShaderMaterial(
  color: THREE.Vector3,
  intensity: number = 1.0
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: color.clone() },
      intensity: { value: intensity },
      pointSize: { value: 0.02 },
      flickerIntensity: { value: 0.1 },
      breathIntensity: { value: 0.0 },
      breathPhase: { value: 0.0 },
    },
    vertexShader: `
      attribute float intensityMultiplier;
      attribute float regionIndex;
      
      uniform float time;
      uniform float pointSize;
      uniform float intensity;
      uniform float breathIntensity;
      uniform float breathPhase;
      
      varying vec3 vColor;
      varying float vIntensity;
      varying float vAlpha;
      
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Perspective-correct point size
        float distance = length(mvPosition.xyz);
        gl_PointSize = pointSize * (300.0 / distance);
        
        // Calculate intensity with breathing effect
        float breath = sin(time * 0.8 + breathPhase) * breathIntensity * 0.1;
        float finalIntensity = intensity * intensityMultiplier * (1.0 + breath);
        
        vIntensity = finalIntensity;
        vAlpha = 0.8 + breath * 0.2;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float flickerIntensity;
      
      varying float vIntensity;
      varying float vAlpha;
      
      // Noise function for flicker
      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      void main() {
        // Circular point sprite
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        
        if (dist > 0.5) discard;
        
        // Soft falloff at edges
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        
        // Flicker effect
        float flicker = noise(gl_PointCoord + time * 0.5) * flickerIntensity;
        
        // Final color with glow
        vec3 finalColor = color * vIntensity * (1.0 + flicker);
        float finalAlpha = vAlpha * alpha;
        
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
  });
}

// Fat line shader for connections (works with LineSegments2)
export function createLineShaderMaterial(
  color: THREE.Vector3,
  intensity: number = 1.0
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: color.clone() },
      intensity: { value: intensity },
      lineThickness: { value: 0.008 },
      dataFlowSpeed: { value: 1.0 },
      dataFlowTime: { value: 0.0 },
      flickerIntensity: { value: 0.15 },
      proximityFade: { value: 1.0 },
    },
    vertexShader: `
      attribute float strength;
      attribute float phase;
      attribute float seed;
      
      uniform float time;
      uniform float lineThickness;
      
      varying vec3 vColor;
      varying float vStrength;
      varying float vPhase;
      varying float vSeed;
      varying float vDistance;
      
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Calculate distance for perspective fade
        vDistance = length(mvPosition.xyz);
        
        // Pass through attributes
        vStrength = strength;
        vPhase = phase;
        vSeed = seed;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float intensity;
      uniform float dataFlowSpeed;
      uniform float dataFlowTime;
      uniform float flickerIntensity;
      uniform float proximityFade;
      
      varying float vStrength;
      varying float vPhase;
      varying float vSeed;
      varying float vDistance;
      
      // Noise function for flicker
      float noise(float p) {
        return fract(sin(p * 12.9898) * 43758.5453);
      }
      
      void main() {
        // Distance-based fade
        float distanceFade = 1.0 / (1.0 + vDistance * 0.1);
        
        // Flicker effect (seeded per edge)
        float flicker = noise(vSeed + time * 0.5) * flickerIntensity;
        
        // Data flow pulse (traveling wave)
        float flowPhase = fract((time * dataFlowSpeed + dataFlowTime + vPhase) * 0.5);
        float dataPulse = sin(flowPhase * 3.14159) * 0.3 + 0.7;
        
        // Combine effects
        float finalIntensity = intensity * vStrength * dataPulse * (1.0 + flicker);
        float finalAlpha = vStrength * distanceFade * proximityFade * 0.6;
        
        vec3 finalColor = color * finalIntensity;
        
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
  });
}

// Simplified landmark shader for eye rings and mouth curve
// No attributes needed, just bright, thick lines
export function createLandmarkShaderMaterial(
  color: THREE.Vector3,
  intensity: number = 1.0
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: color.clone() },
      intensity: { value: intensity },
      lineThickness: { value: 0.025 }, // Much thicker than regular lines (0.008)
    },
    vertexShader: `
      uniform float time;
      uniform float lineThickness;
      
      varying float vDistance;
      
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Calculate distance for perspective fade
        vDistance = length(mvPosition.xyz);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float intensity;
      
      varying float vDistance;
      
      void main() {
        // Distance-based fade (less aggressive for landmarks)
        float distanceFade = 1.0 / (1.0 + vDistance * 0.05);
        
        // Simple pulse effect for visibility
        float pulse = sin(time * 2.0) * 0.1 + 0.9;
        
        // Very bright, high alpha
        float finalIntensity = intensity * pulse;
        float finalAlpha = distanceFade * 0.95; // Much higher alpha than regular lines (0.6)
        
        vec3 finalColor = color * finalIntensity;
        
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
  });
}
