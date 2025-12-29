"use client";

// Diagnostic logging for R3F initialization
if (typeof window !== "undefined") {
  console.log("[HoloFace] Module loading on client side");
  console.log("[HoloFace] Window available:", typeof window !== "undefined");
  console.log("[HoloFace] Document available:", typeof document !== "undefined");
}

import { useRef, useMemo, useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { Points, BufferGeometry, BufferAttribute, Vector2, LineSegments } from "three";
import * as THREE from "three";

// Log module loading
console.log("[HoloFace] Module file loading...");
console.log("[HoloFace] typeof window:", typeof window);
console.log("[HoloFace] typeof document:", typeof document);

// R3F components - loaded dynamically for client-side only rendering
let Canvas: any = null;
let useFrame: any = null;
let Center: any = null;
let Float: any = null;
let EffectComposer: any = null;
let Bloom: any = null;
let ChromaticAberration: any = null;
let useSpring: any = null;
let animated: any = null;
let r3fLoadError: Error | null = null;
let r3fLoadPromise: Promise<void> | null = null;

// Dynamic import function to load R3F only when needed
function loadR3F(): Promise<void> {
  if (r3fLoadPromise) {
    return r3fLoadPromise;
  }
  
  if (typeof window === "undefined") {
    // Server-side: don't load R3F
    return Promise.resolve();
  }
  
  console.log("[HoloFace] Starting dynamic R3F import...");
  r3fLoadPromise = Promise.all([
    import("@react-three/fiber").then((mod) => {
      Canvas = mod.Canvas;
      useFrame = mod.useFrame;
      console.log("[HoloFace] @react-three/fiber loaded");
    }).catch((e) => {
      console.error("[HoloFace] Failed to load @react-three/fiber:", e);
      r3fLoadError = e as Error;
      throw e;
    }),
    import("@react-three/drei").then((mod) => {
      Center = mod.Center;
      Float = mod.Float;
      console.log("[HoloFace] @react-three/drei loaded");
    }).catch((e) => {
      console.error("[HoloFace] Failed to load @react-three/drei:", e);
      if (!r3fLoadError) r3fLoadError = e as Error;
    }),
    import("@react-three/postprocessing").then((mod) => {
      EffectComposer = mod.EffectComposer;
      Bloom = mod.Bloom;
      ChromaticAberration = mod.ChromaticAberration;
      console.log("[HoloFace] @react-three/postprocessing loaded");
    }).catch((e) => {
      console.error("[HoloFace] Failed to load @react-three/postprocessing:", e);
      if (!r3fLoadError) r3fLoadError = e as Error;
    }),
    import("@react-spring/three").then((mod) => {
      useSpring = mod.useSpring;
      animated = mod.animated;
      console.log("[HoloFace] @react-spring/three loaded");
    }).catch((e) => {
      console.error("[HoloFace] Failed to load @react-spring/three:", e);
      if (!r3fLoadError) r3fLoadError = e as Error;
    }),
  ]).then(() => {
    console.log("[HoloFace] All R3F modules loaded successfully");
  }).catch((e) => {
    console.error("[HoloFace] R3F loading failed:", e);
    r3fLoadError = e as Error;
  });
  
  return r3fLoadPromise;
}
import { useHudStore } from "@/lib/state/hudStore";
import { useHoloFaceStore, type HoloConfig } from "@/lib/state/holoFaceStore";
import { useHoloFaceDiagnosticStore } from "@/lib/state/holoFaceDiagnosticStore";
import { ZIP_MODES, type ZipMode } from "@/lib/constants";
import { damp } from "maath/easing";
import { generateHeadPointCloud } from "@/lib/geom/headPointCloud";
import { buildConnections } from "@/lib/geom/buildConnections";
import { createPointShaderMaterial, createLineShaderMaterial, createLandmarkShaderMaterial } from "@/lib/geom/wireframeShaders";
import { generateLandmarkLoops } from "@/lib/geom/landmarkLoops";

interface HoloFaceProps {
  mode: ZipMode;
}

// Damping configuration for smooth transitions
const DAMP_CONFIG = {
  intensity: 0.08,
  color: 0.06,
  scale: 0.1,
  rotation: 0.08,
  mouth: 0.15,
  eye: 0.2,
  scanline: 0.05,
};

// Spring configurations for different animation types
const SPRING_CONFIGS = {
  gentle: { tension: 120, friction: 14 },
  wobbly: { tension: 180, friction: 12 },
  stiff: { tension: 280, friction: 60 },
  slow: { tension: 80, friction: 20 },
};

// Point cloud configuration
const POINT_CLOUD_CONFIG = {
  density: 2500,
  seed: 12345, // Deterministic generation
  connectionThreshold: 0.2,
  maxNeighbors: 8,
};

// Debug controls interface
interface DebugControls {
  intensityMultiplier: number;
  scanlineMultiplier: number;
  fresnelPower: number;
  noiseScale: number;
  bloomMultiplier: number;
  bloomThreshold: number;
  chromaticAberration: number;
}

// Error Boundary Component for R3F
class R3FErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error("[HoloFace] R3F Error Boundary caught error:", error);
    console.error("[HoloFace] Error stack:", error.stack);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[HoloFace] R3F Error Boundary details:", {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
    });
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="relative w-full max-w-[min(320px,45vh)] aspect-square mx-auto flex items-center justify-center border border-red-500/50 rounded">
            <div className="text-red-400 text-sm p-4">
              <p className="font-bold">3D Render Error</p>
              <p className="text-xs mt-2">{this.state.error?.message}</p>
              <details className="text-xs mt-2">
                <summary className="cursor-pointer">Stack trace</summary>
                <pre className="mt-2 text-[10px] overflow-auto max-h-32">
                  {this.state.error?.stack}
                </pre>
              </details>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// Wireframe Face Geometry component
function FaceGeometry({ mode, debugControls }: { mode: ZipMode; debugControls: DebugControls }) {
  console.log("[HoloFace] FaceGeometry rendering, mode:", mode);
  
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<Points>(null);
  const linesRef = useRef<LineSegments>(null);
  
  // Get speech level from HUD store
  const { state } = useHudStore();
  
  // Get config from zustand store
  const config = useHoloFaceStore((s) => s.config);
  const setMode = useHoloFaceStore((s) => s.setMode);
  
  console.log("[HoloFace] FaceGeometry hooks initialized");
  
  // Ellipsoid dimensions (must match headPointCloud.ts)
  const radiusX = 0.5;
  const radiusY = 0.65;
  const radiusZ = 0.55;

  // Generate point cloud, connections, and landmark loops (cached with useMemo)
  const { pointCloud, connections, pointGeometry, lineGeometry, landmarkLoops } = useMemo(() => {
    const cloud = generateHeadPointCloud(POINT_CLOUD_CONFIG.density, POINT_CLOUD_CONFIG.seed);
    const conn = buildConnections(
      cloud.positions,
      POINT_CLOUD_CONFIG.connectionThreshold,
      POINT_CLOUD_CONFIG.maxNeighbors,
      POINT_CLOUD_CONFIG.seed
    );
    
    // Generate landmark loops (eye rings and mouth curve)
    const landmarks = generateLandmarkLoops(radiusX, radiusY, radiusZ);
    
    // Create point geometry
    const positions = new Float32Array(cloud.positions.length * 3);
    const intensityMultipliers = new Float32Array(cloud.positions.length);
    const regionIndices = new Float32Array(cloud.positions.length);
    
    cloud.positions.forEach((pos, i) => {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      intensityMultipliers[i] = cloud.metadata[i].intensityMultiplier;
      
      // Map region to index for shader
      const regionMap: Record<string, number> = {
        face: 0,
        eye_left: 1,
        eye_right: 2,
        mouth: 3,
        nose: 4,
        back: 5,
      };
      regionIndices[i] = regionMap[cloud.metadata[i].region] || 0;
    });
    
    const pointGeo = new BufferGeometry();
    pointGeo.setAttribute("position", new BufferAttribute(positions, 3));
    pointGeo.setAttribute("intensityMultiplier", new BufferAttribute(intensityMultipliers, 1));
    pointGeo.setAttribute("regionIndex", new BufferAttribute(regionIndices, 1));
    
    // Create BufferGeometry for regular LineSegments (we'll use custom shader for thickness)
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new BufferAttribute(conn.linePositions, 3));
    
    // Store metadata for shader uniforms
    const lineCount = conn.linePositions.length / 6; // 2 points per line, 3 coords per point
    const strengths = new Float32Array(lineCount);
    const phases = new Float32Array(lineCount);
    const seeds = new Float32Array(lineCount);
    
    for (let i = 0; i < lineCount; i++) {
      strengths[i] = conn.lineMeta[i * 3];
      phases[i] = conn.lineMeta[i * 3 + 1];
      seeds[i] = conn.lineMeta[i * 3 + 2];
    }
    
    // Add metadata as attributes
    lineGeo.setAttribute("strength", new BufferAttribute(strengths, 1));
    lineGeo.setAttribute("phase", new BufferAttribute(phases, 1));
    lineGeo.setAttribute("seed", new BufferAttribute(seeds, 1));
    
    // Create line geometries for landmark loops
    const eyeLeftGeo = new BufferGeometry();
    eyeLeftGeo.setAttribute("position", new BufferAttribute(landmarks.eyeLeft.positions, 3));
    
    const eyeRightGeo = new BufferGeometry();
    eyeRightGeo.setAttribute("position", new BufferAttribute(landmarks.eyeRight.positions, 3));
    
    const mouthGeo = new BufferGeometry();
    mouthGeo.setAttribute("position", new BufferAttribute(landmarks.mouth.positions, 3));
    
    return {
      pointCloud: cloud,
      connections: conn,
      pointGeometry: pointGeo,
      lineGeometry: lineGeo,
      landmarkLoops: {
        eyeLeft: { geometry: eyeLeftGeo, intensity: landmarks.eyeLeft.intensity },
        eyeRight: { geometry: eyeRightGeo, intensity: landmarks.eyeRight.intensity },
        mouth: { geometry: mouthGeo, intensity: landmarks.mouth.intensity },
      },
    };
  }, []); // Only generate once
  
  // Create materials (cached)
  const pointMaterial = useMemo(
    () => createPointShaderMaterial(config.color, config.intensity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  
  // Create custom line shader material (thicker lines via shader)
  const lineMaterial = useMemo(() => {
    return createLineShaderMaterial(config.color, config.intensity);
  }, [config.color, config.intensity]);
  
  // Create landmark materials with much higher intensity and thicker lines (cached)
  const landmarkMaterial = useMemo(() => {
    // Use 5.0× intensity multiplier for landmarks to make them stand out
    const landmarkIntensity = config.intensity * 5.0;
    return createLandmarkShaderMaterial(config.color, landmarkIntensity);
  }, [config.color, config.intensity]);
  
  // Refs for smooth animation values
  const currentIntensity = useRef(config.intensity);
  const currentColorR = useRef(config.color.x);
  const currentColorG = useRef(config.color.y);
  const currentColorB = useRef(config.color.z);
  const currentDataFlowTime = useRef(0);
  const currentBreathPhase = useRef(0);
  const currentBreathIntensity = useRef(0);
  
  // Helper objects for damp function
  const intensityObj = useRef({ value: config.intensity });
  const colorRObj = useRef({ value: config.color.x });
  const colorGObj = useRef({ value: config.color.y });
  const colorBObj = useRef({ value: config.color.z });
  const breathIntensityObj = useRef({ value: 0 });
  
  // React-spring for group transforms
  const { groupScale, groupRotationY } = useSpring({
    groupScale:
      mode === ZIP_MODES.IDLE
        ? [2.0, 2.0, 2.0]
        : mode === ZIP_MODES.ERROR
          ? [2.1, 2.1, 2.1]
          : [2.0, 2.0, 2.0],
    groupRotationY: mode === ZIP_MODES.THINKING ? 0.15 : 0,
    config: SPRING_CONFIGS.gentle,
  });
  
  // Sync mode changes to store
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
  
  // Animation loop with maath damping
  useFrame(({ clock }: { clock: THREE.Clock }, delta: number) => {
    const time = clock.getElapsedTime();
    
    // Calculate target values based on mode
    let targetIntensity = config.intensity * debugControls.intensityMultiplier;
    let targetBreathIntensity = 0;
    
    // Pulse effect for active states
    if (mode === ZIP_MODES.LISTENING || mode === ZIP_MODES.SPEAKING) {
      const pulse = Math.sin(time * config.pulseSpeed) * 0.15 + 1.0;
      targetIntensity = config.intensity * pulse * debugControls.intensityMultiplier;
    }
    
    // Breathing animation for idle
    if (mode === ZIP_MODES.IDLE) {
      targetBreathIntensity = 1.0;
      if (groupRef.current) {
        const breath = Math.sin(time * 0.8) * 0.015;
        groupRef.current.scale.setScalar(1.0 + breath);
      }
    }
    
    // Data flow speed based on mode
    const dataFlowSpeed = config.scanlineSpeed * debugControls.scanlineMultiplier;
    currentDataFlowTime.current += delta * dataFlowSpeed;
    
    // Breath phase for breathing effect
    currentBreathPhase.current = time * 0.8;
    
    // Apply maath damping for smooth transitions
    intensityObj.current.value = currentIntensity.current;
    damp(intensityObj.current, "value", targetIntensity, DAMP_CONFIG.intensity, delta);
    currentIntensity.current = intensityObj.current.value;
    
    breathIntensityObj.current.value = currentBreathIntensity.current;
    damp(
      breathIntensityObj.current,
      "value",
      targetBreathIntensity,
      DAMP_CONFIG.intensity,
      delta
    );
    currentBreathIntensity.current = breathIntensityObj.current.value;
    
    // Smooth color transition
    colorRObj.current.value = currentColorR.current;
    damp(colorRObj.current, "value", config.color.x, DAMP_CONFIG.color, delta);
    currentColorR.current = colorRObj.current.value;
    
    colorGObj.current.value = currentColorG.current;
    damp(colorGObj.current, "value", config.color.y, DAMP_CONFIG.color, delta);
    currentColorG.current = colorGObj.current.value;
    
    colorBObj.current.value = currentColorB.current;
    damp(colorBObj.current, "value", config.color.z, DAMP_CONFIG.color, delta);
    currentColorB.current = colorBObj.current.value;
    
    // Update point material uniforms
    pointMaterial.uniforms.time.value = time;
    pointMaterial.uniforms.intensity.value = currentIntensity.current;
    pointMaterial.uniforms.color.value.set(
      currentColorR.current,
      currentColorG.current,
      currentColorB.current
    );
    pointMaterial.uniforms.flickerIntensity.value = debugControls.noiseScale * 0.5;
    pointMaterial.uniforms.breathIntensity.value = currentBreathIntensity.current;
    pointMaterial.uniforms.breathPhase.value = currentBreathPhase.current;
    
    // Update line material uniforms
    if (lineMaterial.uniforms) {
      lineMaterial.uniforms.time.value = time;
      lineMaterial.uniforms.intensity.value = currentIntensity.current;
      lineMaterial.uniforms.dataFlowSpeed.value = dataFlowSpeed;
      lineMaterial.uniforms.dataFlowTime.value = currentDataFlowTime.current;
      lineMaterial.uniforms.flickerIntensity.value = debugControls.noiseScale * 0.15;
      lineMaterial.uniforms.proximityFade.value = 1.0;
      lineMaterial.uniforms.color.value.set(
        currentColorR.current,
        currentColorG.current,
        currentColorB.current
      );
      
      // Speech-based mouth intensity modulation
      if (mode === ZIP_MODES.SPEAKING && state.lastSpeechLevel) {
        const speechLevel = state.lastSpeechLevel;
        const mouthIntensityBoost = 0.5 + speechLevel * 0.5;
        lineMaterial.uniforms.intensity.value = currentIntensity.current * (1.0 + mouthIntensityBoost * 0.2);
      }
      
      // Update landmark material uniforms (simplified shader - only time, color, intensity)
      if (landmarkMaterial.uniforms) {
        landmarkMaterial.uniforms.time.value = time;
        landmarkMaterial.uniforms.intensity.value = currentIntensity.current * 5.0;
        landmarkMaterial.uniforms.color.value.set(
          currentColorR.current,
          currentColorG.current,
          currentColorB.current
        );
      }
    }
  });
  
  return (
    <animated.group
      ref={groupRef}
      scale={groupScale as unknown as [number, number, number]}
      rotation-y={groupRotationY}
    >
      {/* Point cloud for wireframe dots */}
      <points ref={pointsRef} geometry={pointGeometry} material={pointMaterial} />
      
      {/* Line network for connections (using custom shader for thickness) */}
      <lineSegments ref={linesRef} geometry={lineGeometry} material={lineMaterial} />
      
      {/* Landmark loops (eye rings and mouth curve) - brighter for visibility */}
      <lineSegments geometry={landmarkLoops.eyeLeft.geometry} material={landmarkMaterial} />
      <lineSegments geometry={landmarkLoops.eyeRight.geometry} material={landmarkMaterial} />
      <lineSegments geometry={landmarkLoops.mouth.geometry} material={landmarkMaterial} />
    </animated.group>
  );
}

// Post-processing effects with smoothed bloom
function Effects({ debugControls }: { debugControls: DebugControls }) {
  const config = useHoloFaceStore((s) => s.config);
  const currentBloom = useRef(config.bloomIntensity);
  const bloomObj = useRef({ value: config.bloomIntensity });
  
  useFrame((_: unknown, delta: number) => {
    bloomObj.current.value = currentBloom.current;
    damp(
      bloomObj.current,
      "value",
      config.bloomIntensity * debugControls.bloomMultiplier,
      0.1,
      delta
    );
    currentBloom.current = bloomObj.current.value;
  });
  
  // Calculate chromatic aberration offset (0 when disabled)
  const chromaticOffset = debugControls.chromaticAberration * 0.001;
  
  return (
    <EffectComposer>
      <Bloom
        intensity={currentBloom.current}
        luminanceThreshold={debugControls.bloomThreshold}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new THREE.Vector2(chromaticOffset, chromaticOffset)}
        radialModulation={false}
        modulationOffset={0}
      />
    </EffectComposer>
  );
}

// Debug controls hook - reads from diagnostic store
function useDebugControls(): DebugControls {
  const diagnosticStore = useHoloFaceDiagnosticStore();
  
  return {
    intensityMultiplier: diagnosticStore.intensityMultiplier,
    scanlineMultiplier: diagnosticStore.scanlineMultiplier,
    fresnelPower: diagnosticStore.fresnelPower,
    noiseScale: diagnosticStore.noiseScale,
    bloomMultiplier: diagnosticStore.bloomMultiplier,
    bloomThreshold: diagnosticStore.bloomThreshold,
    chromaticAberration: diagnosticStore.chromaticAberration,
  };
}

// Main component with responsive sizing
export default function HoloFace({ mode }: HoloFaceProps) {
  console.log("[HoloFace] Component rendering, mode:", mode);
  console.log("[HoloFace] Canvas type:", typeof Canvas, Canvas?.name);
  console.log("[HoloFace] useFrame type:", typeof useFrame);
  console.log("[HoloFace] React version check:", (window as any).React?.version || "unknown");
  
  const debugControls = useDebugControls();
  const [isMounted, setIsMounted] = useState(false);
  const [r3fLoaded, setR3fLoaded] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  
  // Load R3F dynamically and ensure Canvas only renders on client side
  useEffect(() => {
    console.log("[HoloFace] useEffect: Setting mounted state");
    setIsMounted(true);
    
    if (typeof window !== "undefined") {
      console.log("[HoloFace] Loading R3F modules...");
      loadR3F()
        .then(() => {
          console.log("[HoloFace] R3F loaded, Canvas available:", typeof Canvas === "function");
          setR3fLoaded(true);
        })
        .catch((e) => {
          console.error("[HoloFace] R3F load failed:", e);
          setLoadError(e as Error);
        });
    }
  }, []);
  
  if (!isMounted) {
    console.log("[HoloFace] Not mounted yet, showing loading...");
    return (
      <div className="relative w-full max-w-[min(320px,45vh)] aspect-square mx-auto flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }
  
  if (loadError || r3fLoadError) {
    const error = loadError || r3fLoadError;
    console.error("[HoloFace] Rendering error state:", error);
    return (
      <div className="relative w-full max-w-[min(320px,45vh)] aspect-square mx-auto flex items-center justify-center border border-red-500/50 rounded">
        <div className="text-red-400 text-sm p-4">
          <p className="font-bold">R3F Load Error</p>
          <p className="text-xs mt-2">{error?.message}</p>
          <p className="text-xs mt-2 text-yellow-400">
            React Three Fiber failed to load. Ensure @react-three/fiber v9 is installed for React 19 compatibility.
          </p>
          <details className="text-xs mt-2">
            <summary className="cursor-pointer">Error details</summary>
            <pre className="mt-2 text-[10px] overflow-auto max-h-32">
              {error?.stack}
            </pre>
          </details>
        </div>
      </div>
    );
  }
  
  if (!r3fLoaded || !Canvas) {
    console.log("[HoloFace] R3F not loaded yet, showing loading...");
    return (
      <div className="relative w-full max-w-[min(320px,45vh)] aspect-square mx-auto flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading 3D...</div>
      </div>
    );
  }
  
  console.log("[HoloFace] Component mounted, R3F loaded, rendering Canvas");
  
  // Wrap Canvas in error boundary and add logging
  return (
    <R3FErrorBoundary>
      <div className="relative w-full max-w-[min(320px,45vh)] aspect-square mx-auto">
        <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 2.2], fov: 50, near: 0.1, far: 100 }}
        style={{ width: "100%", height: "100%" }}
        resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
      >
        {/* Ambient lighting */}
        <ambientLight intensity={0.2} />
        
        {/* Key lights for holographic effect */}
        <pointLight position={[3, 3, 5]} intensity={0.4} color="#27B4CD" />
        <pointLight position={[-3, 3, 5]} intensity={0.3} color="#24B2E0" />
        <pointLight position={[0, -2, 4]} intensity={0.2} color="#1a9bb0" />
        
        {/* Rim light from behind */}
        <pointLight position={[0, 0, -3]} intensity={0.3} color="#27B4CD" />
        
        {/* Face with floating animation */}
        <Center>
          <Float
            speed={1.2}
            rotationIntensity={0.1}
            floatIntensity={0.3}
            floatingRange={[-0.05, 0.05]}
          >
            <FaceGeometry mode={mode} debugControls={debugControls} />
          </Float>
        </Center>
        
        {/* Post-processing bloom for glow effect */}
        <Effects debugControls={debugControls} />
      </Canvas>
      </div>
    </R3FErrorBoundary>
  );
}
