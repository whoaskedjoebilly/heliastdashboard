import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Server-only client using the service role key, which bypasses RLS. Used
// exclusively by admin API routes (app/api/admin/**, app/api/cron/**) —
// never import this from a "use client" component or anything that ships
// to the browser.
export const supabaseAdmin: SupabaseClient | null = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;
