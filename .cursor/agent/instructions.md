# Cursor Agent Instructions for ZIP

Specific instructions for Cursor Agent when working on the ZIP project.

## Quick Start

1. Read the task description and acceptance criteria
2. Review `context.md` for project overview
3. Check `.cursorrules` for code patterns
4. Look at similar implementations in the codebase
5. Follow the patterns described below
6. Test your changes
7. Submit PR with proper description

## Working with the Event Bus

**CRITICAL**: All UI state changes MUST flow through the event bus.

### Event Bus Pattern

```typescript
import { eventBus } from "@/lib/events/bus";
import type { ZipEvent } from "@/lib/events/types";

// Emit state change
eventBus.emit({
  type: "zip.state",
  payload: { state: "LISTENING" }
});

// Emit panel update
eventBus.emit({
  type: "panel.update",
  payload: { panel: "system_stats", data: stats }
});

// Emit tool result
eventBus.emit({
  type: "tool.card",
  payload: { tool: "get_weather", result: weatherData }
});
```

### Never Mutate State Directly

❌ **Wrong**:
```typescript
// Don't do this
const [state, setState] = useState("IDLE");
setState("LISTENING"); // Direct mutation
```

✅ **Correct**:
```typescript
// Do this instead
eventBus.emit({ type: "zip.state", payload: { state: "LISTENING" } });
```

## Tool Development Workflow

### Step 1: Define Schemas

Create `lib/tools/implementations/my-tool.ts`:

```typescript
import { z } from "zod";

export const myInputSchema = z.object({
  // Define all input fields with validation
  query: z.string().min(1).max(500),
  maxResults: z.number().int().min(1).max(20).optional().default(5),
});

export const myOutputSchema = z.object({
  // Define all output fields
  results: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
    snippet: z.string(),
  })),
  count: z.number().int().min(0),
});
```

### Step 2: Implement the Tool

```typescript
import { trace } from "@/lib/observability/tracing";

export async function myToolImplementation(
  input: z.infer<typeof myInputSchema>
): Promise<z.infer<typeof myOutputSchema>> {
  return trace("my_tool", async (span) => {
    try {
      // Tool logic here
      const results = await fetchData(input.query);
      
      span.setAttributes({
        "tool.input.query": input.query,
        "tool.output.count": results.length,
      });
      
      return {
        results: results.slice(0, input.maxResults),
        count: results.length,
      };
    } catch (error) {
      span.recordError(error);
      throw error;
    }
  });
}
```

### Step 3: Register in Registry

Edit `lib/tools/registry.ts`:

```typescript
import { myToolImplementation, myInputSchema, myOutputSchema } from "./implementations/my-tool";

toolRegistry.set("my_tool", {
  name: "my_tool",
  description: "Clear description for AI - what this tool does",
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  permissionTier: "READ", // or WRITE, ACT, ADMIN
  execute: (input: unknown) => 
    myToolImplementation(input as z.infer<typeof myInputSchema>),
});
```

### Step 4: Create API Endpoint (Optional)

Create `app/api/tools/my_tool/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/middleware/rate-limit";
import { toolExecutor } from "@/lib/tools/executor";
import { myInputSchema } from "@/lib/tools/implementations/my-tool";

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Rate limited" },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const input = myInputSchema.parse(body);
    
    const result = await toolExecutor.execute("my_tool", input);
    
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
```

## Testing Requirements

### Before Submitting PR

1. **Type Check**: `npm run typecheck`
2. **Lint**: `npm run lint`
3. **E2E Tests**: `npm run test:e2e`
4. **Manual Testing**: Test the feature manually
5. **Tool Testing**: If adding a tool, test via API endpoint

### Testing a New Tool

```bash
# Test via API endpoint
curl -X POST http://localhost:3000/api/tools/my_tool \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "maxResults": 5}'
```

### Testing Event Emissions

Check browser console for event emissions:
- Open DevTools
- Look for event emissions in console
- Verify events are being emitted correctly

## Code Quality Standards

### TypeScript

- **Strict mode**: No implicit any
- **No `any` types**: Use proper types or `z.infer<typeof schema>`
- **Type inference**: Use where possible
- **Export types**: For reuse across files

### Error Handling

```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  // Log error
  console.error("Operation failed:", error);
  
  // Record in tracing
  span.recordError(error);
  
  // Return structured error
  throw new Error("Operation failed: " + error.message);
}
```

### Input Validation

**ALWAYS** validate inputs with Zod:

```typescript
const input = inputSchema.parse(body); // Throws if invalid
```

### Security

- **URL Sanitization**: Check for unsafe protocols
- **File Size Limits**: Enforce limits
- **Timeout Protection**: Set timeouts for external calls
- **Rate Limiting**: Use rate limiter for API endpoints

## Common Tasks

### Adding a New Tool

1. Create implementation file
2. Define schemas
3. Implement tool function
4. Register in registry
5. Create API endpoint (optional)
6. Test thoroughly
7. Update documentation

### Modifying Existing Features

1. Understand current implementation
2. Check event bus usage
3. Maintain backward compatibility
4. Update tests
5. Update documentation

### Fixing Bugs

1. Reproduce the bug
2. Identify root cause
3. Check event bus usage
4. Fix the issue
5. Add tests to prevent regression
6. Test thoroughly

## Integration with AI Brain

If your tool should be called by the AI Brain:

1. Ensure tool is registered in registry
2. Tool will be automatically available to AI Brain
3. AI Brain will route to tool based on user request
4. Tool results will be formatted by AI Brain

## Memory System Integration

If your tool needs to use memory:

```typescript
import { getAllPinned, formatPinnedMemoryForPrompt } from "@/lib/memory/memory-manager";

// Get all pinned memory
const pinnedMemory = await getAllPinned();

// Format for prompt
const memoryContext = formatPinnedMemoryForPrompt(pinnedMemory);
```

## Observability

### Tracing

```typescript
import { trace } from "@/lib/observability/tracing";

return trace("tool_name", async (span) => {
  span.setAttributes({
    "tool.input.field": input.field,
  });
  
  // Tool logic
  
  span.setAttributes({
    "tool.output.field": result.field,
  });
  
  return result;
});
```

### Audit Logging

Automatic via `toolExecutor` - no manual logging needed.

## Important Reminders

1. **Event Bus**: Always use event bus for state changes
2. **Type Safety**: No `any` types, use Zod schemas
3. **Testing**: Write tests for new functionality
4. **Documentation**: Update docs if needed
5. **Security**: Validate inputs, sanitize URLs
6. **Observability**: Add tracing for complex operations
7. **Error Handling**: Always handle errors gracefully

## Questions?

1. Check `context.md` for project overview
2. Review `.cursorrules` for detailed patterns
3. Look at similar implementations
4. Check `docs/agents/` documentation
5. Review existing code patterns

Remember: This is a production-grade system. Always prioritize type safety, error handling, security, and observability.

