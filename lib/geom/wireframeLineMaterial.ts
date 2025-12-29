import { LineMaterial, LineMaterialParameters } from "three-stdlib";
import { Vector2, Color } from "three";

// Custom LineMaterial with matrix-style effects
export class MatrixLineMaterial extends LineMaterial {
  constructor(parameters?: LineMaterialParameters) {
    super(parameters);
    
    // Ensure uniforms object exists before adding custom uniforms
    if (!this.uniforms) {
      this.uniforms = {};
    }
    
    // Add custom uniforms for matrix effects
    this.uniforms.time = { value: 0 };
    this.uniforms.dataFlowSpeed = { value: 1.0 };
    this.uniforms.dataFlowTime = { value: 0.0 };
    this.uniforms.flickerIntensity = { value: 0.15 };
    this.uniforms.proximityFade = { value: 1.0 };
    this.uniforms.intensity = { value: 1.0 };
    
    // Use onBeforeCompile to inject matrix effects into the fragment shader
    this.onBeforeCompile = (shader: any) => {
      // Ensure shader uniforms exist
      if (!shader.uniforms) {
        shader.uniforms = {};
      }
      
      // Add matrix effect uniforms to the shader
      if (this.uniforms) {
        shader.uniforms.time = this.uniforms.time;
        shader.uniforms.dataFlowSpeed = this.uniforms.dataFlowSpeed;
        shader.uniforms.dataFlowTime = this.uniforms.dataFlowTime;
        shader.uniforms.flickerIntensity = this.uniforms.flickerIntensity;
        shader.uniforms.proximityFade = this.uniforms.proximityFade;
        shader.uniforms.intensity = this.uniforms.intensity;
      }
      
      // Inject matrix effects code - find the last assignment to gl_FragColor and modify after it
      // We'll add our effects right before the final closing brace of main()
      const fragmentShader = shader.fragmentShader;
      
      // Find the main function and inject effects before its closing brace
      const mainFunctionRegex = /void\s+main\s*\([^)]*\)\s*\{([\s\S]*)\}/;
      const match = fragmentShader.match(mainFunctionRegex);
      
      if (match) {
        // Insert matrix effects before the closing brace
        const matrixEffectsCode = `
        // Matrix effects
        float flicker = fract(sin(time * 0.5 + gl_FragCoord.x * 0.1) * 12.9898) * flickerIntensity;
        float dataPulse = sin((time * dataFlowSpeed + dataFlowTime) * 0.5) * 0.3 + 0.7;
        gl_FragColor.rgb *= intensity * (1.0 + flicker) * dataPulse * proximityFade;
        gl_FragColor.a *= proximityFade;
        `;
        
        shader.fragmentShader = fragmentShader.replace(
          mainFunctionRegex,
          `void main() {${match[1]}${matrixEffectsCode}}`
        );
      } else {
        // Fallback: append at the very end
        shader.fragmentShader = fragmentShader + `
        // Matrix effects (fallback injection)
        float flicker = fract(sin(time * 0.5 + gl_FragCoord.x * 0.1) * 12.9898) * flickerIntensity;
        float dataPulse = sin((time * dataFlowSpeed + dataFlowTime) * 0.5) * 0.3 + 0.7;
        gl_FragColor.rgb *= intensity * (1.0 + flicker) * dataPulse * proximityFade;
        gl_FragColor.a *= proximityFade;
        `;
      }
    };
  }
}

// Factory function to create matrix line material
export function createMatrixLineMaterial(
  color: { r: number; g: number; b: number },
  intensity: number = 1.0,
  resolution: Vector2,
  linewidth: number = 0.008
): MatrixLineMaterial {
  const material = new MatrixLineMaterial({
    linewidth,
    resolution,
    worldUnits: true, // World-space thickness
    transparent: true,
    opacity: 0.8,
  });
  
  // Set color using Color object
  material.color = new Color(color.r, color.g, color.b);
  material.uniforms.intensity.value = intensity;
  
  return material;
}

