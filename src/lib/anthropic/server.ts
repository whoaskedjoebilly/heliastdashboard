import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

// Server-only — never import this from a "use client" component. The key
// comes from the Anthropic Console (console.anthropic.com), separate from
// Supabase; set ANTHROPIC_API_KEY in Vercel to enable custom reports.
export const anthropic: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;
