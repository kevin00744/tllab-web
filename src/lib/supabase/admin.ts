import "server-only";
import { createClient } from "@supabase/supabase-js";

import { supabaseUrl } from "./env";

/** service_role：繞過 RLS，只能在伺服器端用於註冊等管理動作 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("缺少環境變數 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
