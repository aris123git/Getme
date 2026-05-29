// ✅ Alternative - Importer le module par défaut
import supabaseModule from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// La structure peut être différente
export const supabase = supabaseModule.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// ou
// export const supabase = new supabaseModule.SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
