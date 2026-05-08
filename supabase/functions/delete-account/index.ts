// Edge Function: delete-account
//
// Two-step user deletion:
//   1. Client calls public.delete_my_account_data() (RPC) which validates the
//      blocking conditions and clears the user's rows in the public schema.
//   2. Client calls this function with the user's JWT in the Authorization
//      header. The function uses the service role key to delete the auth.users
//      row, which the client cannot do directly.
//
// Deploy: supabase functions deploy delete-account --no-verify-jwt
// (Auth is enforced manually below by validating the bearer token.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Missing authorization" }, 401);
  }

  // Resolve the calling user from the JWT, then run cleanup as that user
  // (so RLS + auth.uid() inside the RPC see them) before promoting to
  // service-role for the auth.users delete.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Invalid token" }, 401);
  }

  const { data: cleanupUserId, error: rpcErr } = await userClient.rpc("delete_my_account_data");
  if (rpcErr) {
    return json({ error: rpcErr.message }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: delErr } = await admin.auth.admin.deleteUser(cleanupUserId ?? user.id);
  if (delErr) {
    return json({ error: delErr.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
