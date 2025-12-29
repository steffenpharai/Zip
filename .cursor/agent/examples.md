# Cursor Agent Examples - ZIP Project

Reference implementations for common patterns in the ZIP project.

## Example 1: Simple READ Tool

**File**: `lib/tools/implementations/weather.ts` (simplified)

```typescript
import { z } from "zod";
import { trace } from "@/lib/observability/tracing";

export const getWeatherInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const getWeatherOutputSchema = z.object({
  tempF: z.number(),
  city: z.string(),
  country: z.string(),
  condition: z.string(),
  humidityPercent: z.number().min(0).max(100),
  windMs: z.number().min(0),
});

export async function getWeather(
  input: z.infer<typeof getWeatherInputSchema>
): Promise<z.infer<typeof getWeatherOutputSchema>> {
  return trace("get_weather", async (span) => {
    try {
      // Implementation
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${input.lat}&longitude=${input.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`
      );
      
      const data = await response.json();
      
      return {
        tempF: (data.current.temperature_2m * 9/5) + 32,
        city: "Unknown", // Would be resolved from coordinates
        country: "Unknown",
        condition: "Clear",
        humidityPercent: data.current.relative_humidity_2m,
        windMs: data.current.wind_speed_10m,
      };
    } catch (error) {
      span.recordError(error);
      throw error;
    }
  });
}
```

**Registration** in `lib/tools/registry.ts`:

```typescript
toolRegistry.set("get_weather", {
  name: "get_weather",
  description: "Get current weather information for a location",
  inputSchema: getWeatherInputSchema,
  outputSchema: getWeatherOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => 
    getWeather(input as z.infer<typeof getWeatherInputSchema>),
});
```

## Example 2: WRITE Tool with Event Emission

**File**: `lib/tools/implementations/notes.ts` (simplified)

```typescript
import { z } from "zod";
import { trace } from "@/lib/observability/tracing";
import { eventBus } from "@/lib/events/bus";
import Database from "better-sqlite3";

export const createNoteInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export const createNoteOutputSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export async function createNote(
  input: z.infer<typeof createNoteInputSchema>
): Promise<z.infer<typeof createNoteOutputSchema>> {
  return trace("create_note", async (span) => {
    try {
      const db = new Database("./data/notes.db");
      
      const result = db
        .prepare("INSERT INTO notes (title, body, created_at) VALUES (?, ?, ?)")
        .run(input.title, input.body, new Date().toISOString());
      
      db.close();
      
      const note = {
        id: result.lastInsertRowid as number,
        title: input.title,
        body: input.body,
        created_at: new Date().toISOString(),
      };
      
      // Emit event for UI update
      eventBus.emit({
        type: "tool.card",
        payload: {
          tool: "create_note",
          result: note,
        },
      });
      
      return note;
    } catch (error) {
      span.recordError(error);
      throw error;
    }
  });
}
```

## Example 3: ACT Tool with Confirmation

**File**: `lib/tools/implementations/web-open.ts` (simplified)

```typescript
import { z } from "zod";
import { trace } from "@/lib/observability/tracing";

export const openUrlInputSchema = z.object({
  url: z.string().url().refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "URL must use http:// or https:// protocol" }
  ),
});

export const openUrlOutputSchema = z.object({
  url: z.string(),
  action: z.literal("open"),
  instruction: z.string(),
});

export async function openUrl(
  input: z.infer<typeof openUrlInputSchema>
): Promise<z.infer<typeof openUrlOutputSchema>> {
  return trace("open_url", async (span) => {
    // ACT-tier tools require confirmation
    // The orchestration system will handle confirmation flow
    // This tool just returns the action to be confirmed
    
    return {
      url: input.url,
      action: "open" as const,
      instruction: `Please confirm: Open ${input.url} in a new browser tab?`,
    };
  });
}
```

## Example 4: API Route with Rate Limiting

**File**: `app/api/tools/web_search/route.ts` (simplified)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/middleware/rate-limit";
import { toolExecutor } from "@/lib/tools/executor";
import { webSearchSchema } from "@/lib/tools/implementations/web-search";

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limited", retryAfter: rateLimitResult.retryAfter },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const input = webSearchSchema.parse(body);
    
    const result = await toolExecutor.execute("web_search", input);
    
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }
    
    console.error("Web search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## Example 5: Event Bus Usage in Component

**File**: `components/hud/SomeComponent.tsx` (simplified)

```typescript
"use client";

import { useEffect } from "react";
import { eventBus } from "@/lib/events/bus";
import type { ZipEvent } from "@/lib/events/types";

export function SomeComponent() {
  useEffect(() => {
    // Subscribe to events
    const unsubscribe = eventBus.subscribe((event: ZipEvent) => {
      if (event.type === "zip.state") {
        console.log("State changed:", event.payload.state);
      }
      
      if (event.type === "panel.update") {
        console.log("Panel updated:", event.payload.panel, event.payload.data);
      }
    });
    
    // Cleanup subscription
    return () => {
      unsubscribe();
    };
  }, []);
  
  const handleClick = () => {
    // Emit event instead of direct state mutation
    eventBus.emit({
      type: "zip.state",
      payload: { state: "LISTENING" },
    });
  };
  
  return (
    <button onClick={handleClick}>
      Start Listening
    </button>
  );
}
```

## Example 6: Integration with AI Brain Orchestration

When a tool is registered, it's automatically available to the AI Brain. The orchestration system will:

1. Analyze user request
2. Determine if tool should be called
3. Call tool via `toolExecutor`
4. Format response
5. Return to user

No additional integration needed - just register the tool!

## Example 7: Tool with Memory Integration

```typescript
import { getAllPinned, formatPinnedMemoryForPrompt } from "@/lib/memory/memory-manager";

export async function myToolWithMemory(
  input: z.infer<typeof myInputSchema>
): Promise<z.infer<typeof myOutputSchema>> {
  return trace("my_tool_with_memory", async (span) => {
    // Get pinned memory
    const pinnedMemory = await getAllPinned();
    const memoryContext = formatPinnedMemoryForPrompt(pinnedMemory);
    
    // Use memory context in tool logic
    // ...
    
    return result;
  });
}
```

## Example 8: Error Handling Pattern

```typescript
export async function robustTool(
  input: z.infer<typeof inputSchema>
): Promise<z.infer<typeof outputSchema>> {
  return trace("robust_tool", async (span) => {
    try {
      // Validate input (already done by executor, but double-check)
      const validatedInput = inputSchema.parse(input);
      
      // Set timeout for external calls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return outputSchema.parse(data);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      span.recordError(error);
      
      // Return structured error
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      
      throw error;
    }
  });
}
```

## Key Takeaways

1. **Always use Zod schemas** for input/output validation
2. **Use tracing** for observability
3. **Emit events** for UI updates (don't mutate state directly)
4. **Handle errors** gracefully with proper error messages
5. **Use rate limiting** in API routes
6. **Set timeouts** for external calls
7. **Register tools** in registry.ts
8. **Follow permission tiers** (READ/WRITE/ACT/ADMIN)

These examples demonstrate the patterns you should follow when working on the ZIP project.

