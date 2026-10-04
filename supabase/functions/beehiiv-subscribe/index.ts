const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BEEHIIV_PUB_ID = "pub_393b5dde-3cfb-4905-914e-dfbdb7cfb01e";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const BEEHIIV_API_KEY = Deno.env.get('BEEHIIV_API_KEY');
    if (!BEEHIIV_API_KEY) {
      throw new Error('BEEHIIV_API_KEY not configured');
    }

    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          ...(name?.trim() && {
            custom_fields: [{ name: 'Full Name', value: name.trim() }],
          }),
          tags: ['rocket'],
          utm_source: 'rocket',
          reactivate_existing: true,
          send_welcome_email: true,
        }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Beehiiv error:', errorText);
      throw new Error('Subscription failed');
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Subscription failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
