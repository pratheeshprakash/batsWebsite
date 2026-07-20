import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// The supabase object is loaded globally from the Supabase CDN script in index.html
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
