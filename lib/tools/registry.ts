import { z } from "zod";
import { getSystemStats as getSystemStatsServer } from "./implementations/system-server";
import { getWeather } from "./implementations/weather";
import { getUptime } from "./implementations/uptime";

import { setCameraEnabled } from "./implementations/camera";
import { analyzeImage, analyzeImageSchema, analyzeImageOutputSchema } from "./implementations/vision";
import { webSearch, webSearchSchema, webSearchOutputSchema } from "./implementations/web-search";
import { fetchUrl, fetchUrlSchema, fetchUrlOutputSchema } from "./implementations/web-fetch";
import { summarizeSources, summarizeSourcesSchema, summarizeSourcesOutputSchema } from "./implementations/web-summarize";
import { openUrl, openUrlSchema, openUrlOutputSchema } from "./implementations/web-open";
import { createNote, createNoteSchema, createNoteOutputSchema, listNotes, listNotesOutputSchema, searchNotes, searchNotesSchema, searchNotesOutputSchema, deleteNote, deleteNoteSchema, deleteNoteOutputSchema } from "./implementations/notes";
import { createTimer, createTimerSchema, createTimerOutputSchema, cancelTimer, cancelTimerSchema, cancelTimerOutputSchema } from "./implementations/timers";
import { calendarCreateEvent, calendarCreateEventSchema, calendarCreateEventOutputSchema, calendarListEvents, calendarListEventsSchema, calendarListEventsOutputSchema } from "./implementations/calendar";
import { ingestDocument, ingestDocumentSchema, ingestDocumentOutputSchema } from "./implementations/docs/ingest";
import { docSearch, docSearchSchema, docSearchOutputSchema } from "./implementations/docs/search";
import { docAnswer, docAnswerSchema, docAnswerOutputSchema } from "./implementations/docs/answer";
import { getPrinterStatus, getPrinterStatusSchema, getPrinterStatusOutputSchema, getPrinterTemperature, getPrinterTemperatureSchema, getPrinterTemperatureOutputSchema, getPrintProgress, getPrintProgressSchema, getPrintProgressOutputSchema, listPrinterFiles, listPrinterFilesSchema, listPrinterFilesOutputSchema } from "./implementations/printer/status";
import { startPrint, startPrintSchema, startPrintOutputSchema, pausePrint, pausePrintSchema, pausePrintOutputSchema, resumePrint, resumePrintSchema, resumePrintOutputSchema, cancelPrint, cancelPrintSchema, cancelPrintOutputSchema, setTemperature, setTemperatureSchema, setTemperatureOutputSchema, homeAxes, homeAxesSchema, homeAxesOutputSchema, moveAxis, moveAxisSchema, moveAxisOutputSchema } from "./implementations/printer/control";
import { uploadGcodeFile, uploadGcodeFileSchema, uploadGcodeFileOutputSchema } from "./implementations/printer/upload";

// Use server version for API routes, client version for direct calls
// Always use server version since tools are called from API routes
const getSystemStats = getSystemStatsServer;

export type PermissionTier = "READ" | "WRITE" | "ACT" | "ADMIN";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  permissionTier: PermissionTier;
  execute: (input: unknown) => Promise<unknown> | unknown;
}

export const toolRegistry: Map<string, ToolDefinition> = new Map();

// System Stats Tool
toolRegistry.set("get_system_stats", {
  name: "get_system_stats",
  description: "Get current system statistics (CPU, RAM, Disk usage)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    cpuPercent: z.number().min(0).max(100),
    ramUsedGb: z.number().min(0),
    ramTotalGb: z.number().min(0),
    diskUsedGb: z.number().min(0),
    diskTotalGb: z.number().min(0),
    cpuLabel: z.string(),
    memLabel: z.string(),
    diskLabel: z.string(),
  }),
  permissionTier: "READ",
  execute: getSystemStats,
});

// Weather Tool
toolRegistry.set("get_weather", {
  name: "get_weather",
  description: "Get comprehensive weather information including current conditions, forecasts, air quality, and location data. REQUIRES latitude and longitude coordinates. If user location is available in the context data provided with the request, use those coordinates automatically. Otherwise, coordinates must be provided - do not call this tool without them.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude coordinate - REQUIRED"),
    lon: z.number().describe("Longitude coordinate - REQUIRED"),
  }),
  outputSchema: z.object({
    tempF: z.number(),
    city: z.string(),
    country: z.string(),
    condition: z.string(),
    humidityPercent: z.number().min(0).max(100),
    windMs: z.number().min(0),
    feelsLikeF: z.number(),
    pressure: z.number().optional(),
    uvIndex: z.number().optional(),
    cloudCover: z.number().optional(),
    visibility: z.number().optional(),
    hourlyForecast: z.array(z.object({
      time: z.string(),
      tempF: z.number(),
      condition: z.string(),
      humidityPercent: z.number(),
      windMs: z.number(),
      precipitationProbability: z.number(),
    })).optional(),
    dailyForecast: z.array(z.object({
      date: z.string(),
      tempMaxF: z.number(),
      tempMinF: z.number(),
      condition: z.string(),
      precipitationSum: z.number(),
      windMaxMs: z.number(),
    })).optional(),
    airQuality: z.object({
      usAqi: z.number(),
      pm10: z.number(),
      pm25: z.number(),
      ozone: z.number(),
    }).optional(),
    elevation: z.number().optional(),
    timezone: z.string().optional(),
    solarRadiation: z.object({
      shortwave: z.number(),
      direct: z.number(),
      diffuse: z.number(),
    }).optional(),
  }),
  permissionTier: "READ",
  execute: (input: unknown) => getWeather(input as { lat?: number; lon?: number }),
});

// Uptime Tool
toolRegistry.set("get_uptime", {
  name: "get_uptime",
  description: "Get system uptime and session statistics",
  inputSchema: z.object({
    sessionStartTime: z.number().optional(),
    commandsCount: z.number().optional(),
  }),
  outputSchema: z.object({
    runningSeconds: z.number().min(0),
    sessionCount: z.number().min(0),
    commandsCount: z.number().min(0),
    loadLabel: z.string(),
    loadPercent: z.number().min(0).max(100),
    sessionTimeLabel: z.string(),
  }),
  permissionTier: "READ",
  execute: (input: unknown) => getUptime(input as { sessionStartTime?: number; commandsCount?: number }),
});

// Camera Tool
toolRegistry.set("set_camera_enabled", {
  name: "set_camera_enabled",
  description: "Enable or disable camera",
  inputSchema: z.object({
    enabled: z.boolean(),
  }),
  outputSchema: z.object({
    enabled: z.boolean(),
  }),
  permissionTier: "ACT",
  execute: (input: unknown) => setCameraEnabled(input as { enabled: boolean }),
});

// Vision Tools
toolRegistry.set("analyze_image", {
  name: "analyze_image",
  description: "Analyze an image from webcam or upload using vision AI",
  inputSchema: analyzeImageSchema,
  outputSchema: analyzeImageOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => analyzeImage(input as z.infer<typeof analyzeImageSchema>),
});

// Web Research Tools
toolRegistry.set("web_search", {
  name: "web_search",
  description: "Search the web for current information",
  inputSchema: webSearchSchema,
  outputSchema: webSearchOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => webSearch(input as z.infer<typeof webSearchSchema>),
});

toolRegistry.set("fetch_url", {
  name: "fetch_url",
  description: "Fetch and extract readable content from a URL",
  inputSchema: fetchUrlSchema,
  outputSchema: fetchUrlOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => fetchUrl(input as z.infer<typeof fetchUrlSchema>),
});

toolRegistry.set("summarize_sources", {
  name: "summarize_sources",
  description: "Summarize multiple web sources with citations",
  inputSchema: summarizeSourcesSchema,
  outputSchema: summarizeSourcesOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => summarizeSources(input as z.infer<typeof summarizeSourcesSchema>),
});

// Web Integration Tools
toolRegistry.set("open_url", {
  name: "open_url",
  description: "Open a URL in a new browser tab (requires user confirmation)",
  inputSchema: openUrlSchema,
  outputSchema: openUrlOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => openUrl(input as z.infer<typeof openUrlSchema>),
});

// Notes Tools
toolRegistry.set("create_note", {
  name: "create_note",
  description: "Create a new note",
  inputSchema: createNoteSchema,
  outputSchema: createNoteOutputSchema,
  permissionTier: "WRITE",
  execute: (input: unknown) => createNote(input as z.infer<typeof createNoteSchema>),
});

toolRegistry.set("list_notes", {
  name: "list_notes",
  description: "List all notes",
  inputSchema: z.object({}),
  outputSchema: listNotesOutputSchema,
  permissionTier: "READ",
  execute: () => listNotes(),
});

toolRegistry.set("search_notes", {
  name: "search_notes",
  description: "Search notes by title or content",
  inputSchema: searchNotesSchema,
  outputSchema: searchNotesOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => searchNotes(input as z.infer<typeof searchNotesSchema>),
});

toolRegistry.set("delete_note", {
  name: "delete_note",
  description: "Delete a note by ID",
  inputSchema: deleteNoteSchema,
  outputSchema: deleteNoteOutputSchema,
  permissionTier: "WRITE",
  execute: (input: unknown) => deleteNote(input as z.infer<typeof deleteNoteSchema>),
});

// Timer Tools
toolRegistry.set("create_timer", {
  name: "create_timer",
  description: "Create a timer that will send a reminder after specified seconds",
  inputSchema: createTimerSchema,
  outputSchema: createTimerOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => createTimer(input as z.infer<typeof createTimerSchema>),
});

toolRegistry.set("cancel_timer", {
  name: "cancel_timer",
  description: "Cancel a scheduled timer",
  inputSchema: cancelTimerSchema,
  outputSchema: cancelTimerOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => cancelTimer(input as z.infer<typeof cancelTimerSchema>),
});

// Calendar Tools (graceful handling when integration not configured)
toolRegistry.set("calendar_create_event", {
  name: "calendar_create_event",
  description: "Create a calendar event (integration not configured)",
  inputSchema: calendarCreateEventSchema,
  outputSchema: calendarCreateEventOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => calendarCreateEvent(input as z.infer<typeof calendarCreateEventSchema>),
});

toolRegistry.set("calendar_list_events", {
  name: "calendar_list_events",
  description: "List calendar events (integration not configured)",
  inputSchema: calendarListEventsSchema,
  outputSchema: calendarListEventsOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => calendarListEvents(input as z.infer<typeof calendarListEventsSchema>),
});

// Document Intelligence Tools
toolRegistry.set("ingest_document", {
  name: "ingest_document",
  description: "Ingest a PDF or text document for later search and Q&A",
  inputSchema: ingestDocumentSchema,
  outputSchema: ingestDocumentOutputSchema,
  permissionTier: "WRITE",
  execute: (input: unknown) => ingestDocument(input as z.infer<typeof ingestDocumentSchema>),
});

toolRegistry.set("doc_search", {
  name: "doc_search",
  description: "Search ingested documents for relevant chunks",
  inputSchema: docSearchSchema,
  outputSchema: docSearchOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => docSearch(input as z.infer<typeof docSearchSchema>),
});

toolRegistry.set("doc_answer", {
  name: "doc_answer",
  description: "Answer a question using ingested documents",
  inputSchema: docAnswerSchema,
  outputSchema: docAnswerOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => docAnswer(input as z.infer<typeof docAnswerSchema>),
});

// 3D Printer Status Tools (READ tier)
toolRegistry.set("get_printer_status", {
  name: "get_printer_status",
  description: "Get comprehensive 3D printer status including state, temperatures, position, and print progress",
  inputSchema: getPrinterStatusSchema,
  outputSchema: getPrinterStatusOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => getPrinterStatus(input as z.infer<typeof getPrinterStatusSchema>),
});

toolRegistry.set("get_printer_temperature", {
  name: "get_printer_temperature",
  description: "Get current hotend and bed temperatures from the 3D printer",
  inputSchema: getPrinterTemperatureSchema,
  outputSchema: getPrinterTemperatureOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => getPrinterTemperature(input as z.infer<typeof getPrinterTemperatureSchema>),
});

toolRegistry.set("get_print_progress", {
  name: "get_print_progress",
  description: "Get current print job progress including percentage, time remaining, and status",
  inputSchema: getPrintProgressSchema,
  outputSchema: getPrintProgressOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => getPrintProgress(input as z.infer<typeof getPrintProgressSchema>),
});

toolRegistry.set("list_printer_files", {
  name: "list_printer_files",
  description: "List G-code files available on the 3D printer",
  inputSchema: listPrinterFilesSchema,
  outputSchema: listPrinterFilesOutputSchema,
  permissionTier: "READ",
  execute: (input: unknown) => listPrinterFiles(input as z.infer<typeof listPrinterFilesSchema>),
});

// 3D Printer Control Tools (ACT tier - require confirmation)
toolRegistry.set("start_print", {
  name: "start_print",
  description: "Start printing a G-code file on the 3D printer (requires user confirmation)",
  inputSchema: startPrintSchema,
  outputSchema: startPrintOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => startPrint(input as z.infer<typeof startPrintSchema>),
});

toolRegistry.set("pause_print", {
  name: "pause_print",
  description: "Pause the current print job on the 3D printer (requires user confirmation)",
  inputSchema: pausePrintSchema,
  outputSchema: pausePrintOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => pausePrint(input as z.infer<typeof pausePrintSchema>),
});

toolRegistry.set("resume_print", {
  name: "resume_print",
  description: "Resume a paused print job on the 3D printer (requires user confirmation)",
  inputSchema: resumePrintSchema,
  outputSchema: resumePrintOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => resumePrint(input as z.infer<typeof resumePrintSchema>),
});

toolRegistry.set("cancel_print", {
  name: "cancel_print",
  description: "Cancel the current print job on the 3D printer (requires user confirmation)",
  inputSchema: cancelPrintSchema,
  outputSchema: cancelPrintOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => cancelPrint(input as z.infer<typeof cancelPrintSchema>),
});

toolRegistry.set("set_temperature", {
  name: "set_temperature",
  description: "Set target temperature for hotend or bed on the 3D printer (requires user confirmation)",
  inputSchema: setTemperatureSchema,
  outputSchema: setTemperatureOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => setTemperature(input as z.infer<typeof setTemperatureSchema>),
});

toolRegistry.set("home_axes", {
  name: "home_axes",
  description: "Home specified axes on the 3D printer (requires user confirmation)",
  inputSchema: homeAxesSchema,
  outputSchema: homeAxesOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => homeAxes(input as z.infer<typeof homeAxesSchema>),
});

toolRegistry.set("move_axis", {
  name: "move_axis",
  description: "Move a specific axis (X, Y, Z, or E) on the 3D printer (requires user confirmation)",
  inputSchema: moveAxisSchema,
  outputSchema: moveAxisOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => moveAxis(input as z.infer<typeof moveAxisSchema>),
});

toolRegistry.set("upload_gcode_file", {
  name: "upload_gcode_file",
  description: "Upload a G-code file to the 3D printer (requires user confirmation)",
  inputSchema: uploadGcodeFileSchema,
  outputSchema: uploadGcodeFileOutputSchema,
  permissionTier: "ACT",
  execute: (input: unknown) => uploadGcodeFile(input as z.infer<typeof uploadGcodeFileSchema>),
});

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

/**
 * Check if permission tier requires confirmation
 */
export function requiresConfirmation(permissionTier: PermissionTier): boolean {
  return permissionTier === "ACT" || permissionTier === "ADMIN";
}

