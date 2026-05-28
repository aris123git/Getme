import * as supabaseModule from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = supabaseModule.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
