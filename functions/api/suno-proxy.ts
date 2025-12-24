export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Suno-Cookie",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequestPost(context) {
  const request = context.request;
  const sunoUrl = "https://studio-api.prod.suno.com/api/generate/v2/";

  // 1. Parse incoming body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }

  // 2. Prepare headers
  const authHeader = request.headers.get("Authorization");
  const customCookieHeader = request.headers.get("X-Suno-Cookie");
  
  // Extract Device-Id from cookie if available (ajs_anonymous_id), otherwise generate random UUID
  let deviceId = crypto.randomUUID();
  if (customCookieHeader) {
      try {
        const parts = customCookieHeader.split(';');
        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key && key.trim() === 'ajs_anonymous_id') {
                let val = value.trim();
                try { val = decodeURIComponent(val); } catch(e){}
                // Remove surrounding quotes if present
                deviceId = val.replace(/^"+|"+$/g, '');
                break;
            }
        }
      } catch (e) {
          // ignore parsing error
      }
  }

  const headers = {
    "Content-Type": "application/json",
    // Mimic the User-Agent from the working backend
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Affiliate-Id": "undefined",
    // Device-Id must be quoted
    "Device-Id": `"${deviceId}"`,
    "x-suno-client": "Android prerelease-4nt180t 1.0.42",
    "X-Requested-With": "com.suno.android",
    "sec-ch-ua": '"Chromium";v="130", "Android WebView";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"'
  };

  if (authHeader) {
    headers["Authorization"] = authHeader;
  }
  
  if (customCookieHeader) {
    headers["Cookie"] = customCookieHeader;
  }

  try {
    const sunoResponse = await fetch(sunoUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    const responseText = await sunoResponse.text();

    return new Response(responseText, {
      status: sunoResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Suno-Cookie"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Proxy Error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}