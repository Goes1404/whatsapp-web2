import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente do banco, sempre com a chave SECRETA e só no servidor: as tabelas
 * não têm policy nenhuma, e a chave pública não lê nada (ver a migration).
 * `null` sem configuração: o app cai para o armazenamento da Evolution.
 */
let cliente: SupabaseClient | null | undefined;

export function banco(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  cliente = url && chave ? createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cliente;
}
