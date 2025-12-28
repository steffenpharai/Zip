/**
 * Vision tools for webcam frame analysis
 */

import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const analyzeImageSchema = z.object({
  imageBase64: z.string().describe("Base64-encoded image data (with data URL prefix)"),
  prompt: z.string().optional().describe("Optional prompt for specific analysis"),
});

export const analyzeImageOutputSchema = z.object({
  analysis: z.string(),
  objects: z.array(z.object({
    name: z.string(),
    confidence: z.number().optional(),
  })).optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
});

export async function analyzeImage(input: z.infer<typeof analyzeImageSchema>): Promise<z.infer<typeof analyzeImageOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  // Extract base64 data from data URL if present
  let imageData = input.imageBase64;
  if (imageData.startsWith("data:image")) {
    imageData = imageData.split(",")[1] || imageData;
  }
  
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";
  
  const prompt = input.prompt || "Analyze this image and describe what you see. Identify any objects, text, or notable features.";
  
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageData}`,
            },
          },
        ],
      },
    ],
    max_tokens: 500,
  });
  
  const analysis = response.choices[0]?.message?.content || "Unable to analyze image";
  
  // Extract objects and text if mentioned in analysis
  // In a production system, you might use a more sophisticated extraction
  const objects: Array<{ name: string; confidence?: number }> = [];
  const textMatch = analysis.match(/text[:\s]+"([^"]+)"/i);
  const text = textMatch ? textMatch[1] : undefined;
  
  return {
    analysis,
    objects: objects.length > 0 ? objects : undefined,
    text,
  };
}

