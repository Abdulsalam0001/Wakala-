import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed"
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const authHeader =
    req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    }
  );


  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();


  if (userError || !user) {

    return new Response(
      JSON.stringify({
        error: "Unauthorized"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }


  const {
    data: profile,
    error: profileError
  } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      status
    `)
    .eq("id", user.id)
    .single();


  if (profileError) {

    return new Response(
      JSON.stringify({
        error: "Unable to load profile"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }


  const {
    data: wallet,
    error: walletError
  } = await supabase
    .from("wallets")
    .select(`
      id,
      account_number,
      status
    `)
    .eq("user_id", user.id)
    .single();


  if (walletError) {

    return new Response(
      JSON.stringify({
        error: "Unable to load wallet"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }


  const {
    data: balances,
    error: balanceError
  } = await supabase
    .from("wallet_balances")
    .select(`
      id,
      currency,
      available,
      pending
    `)
    .eq("wallet_id", wallet.id)
    .order("currency");


  if (balanceError) {

    return new Response(
      JSON.stringify({
        error: "Unable to load balances"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }


  const {
    data: transactions,
    error: transactionError
  } = await supabase
    .from("transactions")
    .select(`
      id,
      type,
      status,
      currency,
      amount,
      fee,
      reference,
      description,
      created_at
    `)
    .eq("wallet_id", wallet.id)
    .order("created_at", {
      ascending: false
    })
    .limit(10);


  if (transactionError) {

    return new Response(
      JSON.stringify({
        error: "Unable to load activity"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  }


  return new Response(
    JSON.stringify({
      profile,
      wallet,
      balances: balances ?? [],
      transactions: transactions ?? []
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store"
      }
    }
  );

});