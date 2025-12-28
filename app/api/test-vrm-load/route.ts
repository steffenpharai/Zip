import { NextResponse } from "next/server";

/**
 * Test endpoint to verify VRM loading
 * This endpoint doesn't actually load the VRM (that's client-side),
 * but it can be used to verify the logging system is working
 */
export async function GET() {
  // Log a test message to verify logging works
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO] VRM Test Endpoint - Logging system is active`);
  console.log(`[${timestamp}] [INFO] To see VRM logs, access the HUD page at http://localhost:3000`);
  console.log(`[${timestamp}] [INFO] The VRM component will load automatically when the page renders`);

  return NextResponse.json({
    success: true,
    message: "Logging system is active. Access the HUD page to trigger VRM loading.",
    instructions: [
      "1. Open http://localhost:3000 in your browser",
      "2. Navigate to the HUD page (where ZipFaceStage is rendered)",
      "3. The VRM will load automatically and logs will appear in Docker logs",
      "4. Run: docker-compose logs app | Select-String -Pattern 'VRM' to see VRM logs"
    ]
  });
}

