import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://wakala.cfd",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  // IMPORTANT:
  // Handle browser CORS preflight BEFORE anything else.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(
        {
          error: "Supabase environment variables are missing",
        },
        500
      );
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json(
        {
          error: "Missing authorization",
        },
        401
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // -----------------------------------------
    // AUTH
    // -----------------------------------------

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Auth error:", userError);

      return json(
        {
          error: "Unauthorized",
        },
        401
      );
    }

    // -----------------------------------------
    // PROFILE
    // -----------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        phone
      `)
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile error:", profileError);

      return json(
        {
          error: "Unable to load profile",
          details: profileError.message,
        },
        500
      );
    }

    // -----------------------------------------
    // WALLET
    // -----------------------------------------

    const {
      data: wallet,
      error: walletError,
    } = await supabase
      .from("wallets")
      .select(`
        id,
        user_id,
        account_number
      `)
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError) {
      console.error("Wallet error:", walletError);

      return json(
        {
          error: "Unable to load wallet",
          details: walletError.message,
        },
        500
      );
    }

    if (!wallet) {
      return json(
        {
          error: "Wallet not found",
        },
        404
      );
    }

    // -----------------------------------------
    // REAL WALLET BALANCES
    // -----------------------------------------

    const {
      data: balances,
      error: balanceError,
    } = await supabase
      .from("wallet_balances")
      .select(`
        currency,
        available
      `)
      .eq("wallet_id", wallet.id)
      .order("currency");

    if (balanceError) {
      console.error("Balance error:", balanceError);

      return json(
        {
          error: "Unable to load wallet balances",
          details: balanceError.message,
        },
        500
      );
    }

    const supportedCurrencies = [
      "TZS",
      "KES",
      "RWF",
      "NGN",
      "USDC",
      "USDT",
      "BTC",
    ];

    const balanceMap = new Map(
      (balances ?? []).map((item) => [
        item.currency,
        item.available ?? 0,
      ])
    );

    const normalizedBalances =
      supportedCurrencies.map((currency) => ({
        currency,
        available:
          balanceMap.get(currency) ?? 0,
      }));

    // -----------------------------------------
    // TRANSACTIONS
    // -----------------------------------------

    let transactions: any[] = [];

    const {
      data: transactionData,
      error: transactionError,
    } = await supabase
      .from("transactions")
      .select(`
        id,
        amount,
        currency,
        type,
        status,
        description,
        created_at
      `)
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

    if (transactionError) {
      console.warn(
        "Transactions could not be loaded:",
        transactionError.message
      );
    } else {
      transactions = transactionData ?? [];
    }

    // -----------------------------------------
    // RESPONSE
    // -----------------------------------------

    return json({
      profile: {
        id: user.id,
        full_name:
          profile?.full_name ??
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          "",
        phone:
          profile?.phone ??
          user.phone ??
          null,
        email: user.email ?? null,
      },

      wallet: {
        id: wallet.id,
        account_number:
          wallet.account_number,
      },

      balances: normalizedBalances,

      transactions,
    });
  } catch (error) {
    console.error(
      "wallet-overview unexpected error:",
      error
    );

    return json(
      {
        error: "Internal server error",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
});
