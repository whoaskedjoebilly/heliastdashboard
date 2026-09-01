import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// null until a Supabase project is created and its URL/anon key are set in
// Vercel (dashboard-live-setup.md Phase 2 & 10) — callers fall back to demo
// behavior when this is null.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
