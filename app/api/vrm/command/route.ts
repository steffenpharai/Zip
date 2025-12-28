import { NextRequest, NextResponse } from "next/server";
import { commandQueues, type VRMCommand, type VRMCommandType } from "@/lib/vrm/command-queue";

// Generate session ID from request (simple implementation)
function getSessionId(request: NextRequest): string {
  // Use IP + User-Agent as session identifier
  const ip = request.headers.get("x-forwarded-for") || 
             request.headers.get("x-real-ip") || 
             "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  // Simple hash
  return Buffer.from(`${ip}:${ua}`).toString("base64").substring(0, 32);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !["set_bone_rotation", "set_bone_position", "set_blend_shape", "get_state", "reset_pose", "set_pose"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid command type" },
        { status: 400 }
      );
    }

    const sessionId = getSessionId(request);
    const command: VRMCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: type as VRMCommandType,
      timestamp: Date.now(),
      data: data || {},
    };

    // Initialize queue for session if needed
    if (!commandQueues.has(sessionId)) {
      commandQueues.set(sessionId, []);
    }

    const queue = commandQueues.get(sessionId)!;
    queue.push(command);

    // Clean up old commands (older than 30 seconds)
    const now = Date.now();
    const filtered = queue.filter(cmd => now - cmd.timestamp < 30000);
    commandQueues.set(sessionId, filtered);

    // Clean up old sessions (older than 5 minutes)
    if (commandQueues.size > 100) {
      // Simple cleanup - remove oldest entries
      const entries = Array.from(commandQueues.entries());
      entries.sort((a, b) => {
        const aLatest = Math.max(...a[1].map(c => c.timestamp));
        const bLatest = Math.max(...b[1].map(c => c.timestamp));
        return aLatest - bLatest;
      });
      // Remove oldest 20%
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        commandQueues.delete(entries[i][0]);
      }
    }

    return NextResponse.json({
      success: true,
      commandId: command.id,
      sessionId,
    });
  } catch (error) {
    console.error("Error queuing VRM command:", error);
    return NextResponse.json(
      { error: "Failed to queue command" },
      { status: 500 }
    );
  }
}

