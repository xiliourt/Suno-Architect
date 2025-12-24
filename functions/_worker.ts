interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Suno-Cookie",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    // Handle OPTIONS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Handle API Routes
    if (url.pathname === "/api/suno-proxy" && request.method === "POST") {
      const sunoUrl = "https://studio-api.prod.suno.com/api/generate/v2/";
      return handleSunoRequest(request, sunoUrl, corsHeaders);
    }

    // Serve Static Assets (Frontend)
    return env.ASSETS.fetch(request);
  },
};

async function handleSunoRequest(request: Request, targetUrl: string, corsHeaders: any) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const authHeader = request.headers.get("Authorization");
  const customCookieHeader = request.headers.get("X-Suno-Cookie");
  
  // Extract Device-Id (reuse logic)
  let deviceId: string = crypto.randomUUID();
  if (customCookieHeader) {
      try {
        const parts = customCookieHeader.split(';');
        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && key.trim() === 'ajs_anonymous_id') {
                let val = value.trim();
                try { val = decodeURIComponent(val); } catch(e){}
                deviceId = val.replace(/^"+|"+$/g, '');
                break;
            }
        }
      } catch (e) {}
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Affiliate-Id": "undefined",
    "Device-Id": `"${deviceId}"`,
    "x-suno-client": "Android prerelease-4nt180t 1.0.42",
    "X-Requested-With": "com.suno.android",
    "sec-ch-ua": '"Chromium";v="130", "Android WebView";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"'
  };

  if (authHeader) headers["Authorization"] = authHeader;
  if (customCookieHeader) headers["Cookie"] = customCookieHeader;

  try {
    const sunoResponse = await fetch(targetUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    const responseText = await sunoResponse.text();

    return new Response(responseText, {
      status: sunoResponse.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Proxy Error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}
