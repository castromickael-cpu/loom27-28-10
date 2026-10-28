/* Loom — conexão com o Supabase
   Pegue os dois valores em: Supabase → Project Settings → API
   (a chave "anon" / "publishable" é pública por design; quem protege os dados é o RLS do schema.sql). */
const SUPABASE_URL = "https://xrwgeffinoqpwollrhrq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VTUxniLICOUXQ2jbX_Df8A_z0D8_hFA";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
