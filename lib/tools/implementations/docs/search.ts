/**
 * Document search tool
 * 
 * Vector search for relevant chunks using embeddings
 */

import { z } from "zod";
import OpenAI from "openai";
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DATA_DIR = join(process.cwd(), "data");
const DOCS_DB_PATH = join(DATA_DIR, "docs.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!existsSync(DOCS_DB_PATH)) {
      throw new Error("Documents database not found. Please ingest documents first.");
    }
    db = new Database(DOCS_DB_PATH);
  }
  return db;
}

/**
 * Compute cosine similarity
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const docSearchSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().max(10).default(5),
  docId: z.string().optional(),
});

export const docSearchOutputSchema = z.object({
  chunks: z.array(z.object({
    id: z.string(),
    text: z.string(),
    doc_id: z.string(),
    filename: z.string(),
    relevance: z.number(),
  })),
});

export async function docSearch(input: z.infer<typeof docSearchSchema>): Promise<z.infer<typeof docSearchOutputSchema>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  
  const database = getDb();
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(input.query);
  
  // Get all chunks (or filtered by doc_id)
  let chunksQuery = `
    SELECT c.chunk_id, c.doc_id, c.text, c.embedding, d.filename
    FROM chunks c
    JOIN documents d ON c.doc_id = d.doc_id
  `;
  
  const params: unknown[] = [];
  if (input.docId) {
    chunksQuery += " WHERE c.doc_id = ?";
    params.push(input.docId);
  }
  
  const rows = database.prepare(chunksQuery).all(...params) as Array<{
    chunk_id: string;
    doc_id: string;
    text: string;
    embedding: string;
    filename: string;
  }>;
  
  // Compute similarities
  const similarities = rows.map(row => {
    const chunkEmbedding = JSON.parse(row.embedding) as number[];
    const relevance = cosineSimilarity(queryEmbedding, chunkEmbedding);
    return {
      id: row.chunk_id,
      text: row.text,
      doc_id: row.doc_id,
      filename: row.filename,
      relevance,
    };
  });
  
  // Sort by relevance and take top results
  const topChunks = similarities
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, input.maxResults);
  
  return {
    chunks: topChunks,
  };
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.substring(0, 8000),
  });
  
  return response.data[0].embedding;
}

