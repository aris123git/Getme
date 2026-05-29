// supabaseClient.js - VERSION CORRECTE
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://nuijvjnufnaodwtrhjuq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Z3l5W3VqqpSeFz6azxmrkw_fAZmT-iH';

// Créer et exporter le client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const UNLOCK_COST = 500;
export const DEFAULT_RADIUS = 5;
export const MAX_RADIUS = 20;
export const GPS_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 10000
};
