import { NextRequest, NextResponse } from "next/server";

// In-memory state storage (per session)
// In production, consider using Redis
export const vrmStates = new Map<string, VRMState>();

export interface VRMState {
  sessionId: string;
  timestamp: number;
  bones: Record<string, {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
  blendShapes: Record<string, number>;
  availableBones: string[];
  availableBlendShapes: string[];
}

// Generate session ID from request
function getSessionId(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") || 
             request.headers.get("x-real-ip") || 
             "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return Buffer.from(`${ip}:${ua}`).toString("base64").substring(0, 32);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bones, blendShapes, availableBones, availableBlendShapes } = body;

    const sessionId = getSessionId(request);
    
    const state: VRMState = {
      sessionId,
      timestamp: Date.now(),
      bones: bones || {},
      blendShapes: blendShapes || {},
      availableBones: availableBones || [],
      availableBlendShapes: availableBlendShapes || [],
    };

    vrmStates.set(sessionId, state);

    // Clean up old states (older than 5 minutes)
    const now = Date.now();
    if (vrmStates.size > 100) {
      const entries = Array.from(vrmStates.entries());
      for (const [id, state] of entries) {
        if (now - state.timestamp > 300000) {
          vrmStates.delete(id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
    });
  } catch (error) {
    console.error("Error storing VRM state:", error);
    return NextResponse.json(
      { error: "Failed to store state" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = getSessionId(request);
    const state = vrmStates.get(sessionId);

    if (!state) {
      return NextResponse.json({
        success: false,
        message: "No state found for session",
      });
    }

    return NextResponse.json({
      success: true,
      state,
    });
  } catch (error) {
    console.error("Error fetching VRM state:", error);
    return NextResponse.json(
      { error: "Failed to fetch state" },
      { status: 500 }
    );
  }
}

