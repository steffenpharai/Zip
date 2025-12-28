import { NextRequest, NextResponse } from "next/server";
import { commandQueues } from "@/lib/vrm/command-queue";

// Generate session ID from request (same as command endpoint)
function getSessionId(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for") || 
             request.headers.get("x-real-ip") || 
             "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return Buffer.from(`${ip}:${ua}`).toString("base64").substring(0, 32);
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = getSessionId(request);
    const queue = commandQueues.get(sessionId) || [];

    // Return and clear pending commands
    const commands = [...queue];
    commandQueues.set(sessionId, []);

    return NextResponse.json({
      success: true,
      commands,
      count: commands.length,
    });
  } catch (error) {
    console.error("Error fetching VRM commands:", error);
    return NextResponse.json(
      { error: "Failed to fetch commands" },
      { status: 500 }
    );
  }
}

