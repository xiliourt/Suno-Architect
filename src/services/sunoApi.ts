import { ParsedSunoOutput } from "../types";

export const triggerSunoGeneration = async (
  data: ParsedSunoOutput, 
  cookie: string
): Promise<any> => {
  if (!cookie) {
    throw new Error("Suno Cookie/Token is missing.");
  }

  // Point to the Cloudflare Function endpoint
  // You can update this URL if your function is hosted elsewhere
  const PROXY_ENDPOINT = "/api/suno-proxy";
  
  // Construct payload for Custom Mode
  const payload = {
    prompt: data.lyricsWithTags || "",
    tags: data.style || "",
    title: data.title || "Suno Architect Generation",
    make_instrumental: !data.lyricsWithTags && !!data.style,
    mv: "chirp-bluejay", // Updated to v4.5 (Bluejay)
    continue_clip_id: null,
    continue_at: null,
    generation_type: "TEXT"
  };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Handle Authentication
    const trimmedCookie = cookie.trim();
    
    // Check if it's a Bearer token (JWT usually starts with ey...)
    if (trimmedCookie.startsWith("ey")) {
        headers["Authorization"] = `Bearer ${trimmedCookie}`;
    } else {
        // Use a custom header for the cookie string.
        // Browsers BLOCK the standard 'Cookie' header in fetch requests.
        // The Cloudflare proxy will map 'X-Suno-Cookie' to 'Cookie' before calling Suno.
        headers["X-Suno-Cookie"] = trimmedCookie;
    }

    const response = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Status ${response.status}`;
      
      try {
          const jsonErr = JSON.parse(errorText);
          if (jsonErr.detail) errorMessage = jsonErr.detail;
          if (jsonErr.message) errorMessage = jsonErr.message;
          if (jsonErr.error) errorMessage = jsonErr.error;
      } catch (e) {
          // Fallback if not JSON
          const cleanText = errorText.replace(/<[^>]*>?/gm, '').substring(0, 200);
          if (cleanText) errorMessage = cleanText;
      }
      throw new Error(`Suno API Failed: ${errorMessage}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Suno Sync Error:", error);
    // Helpful error for deployment mismatch
    if (error.message.includes("Unexpected token") || error.message.includes("404")) {
       throw new Error(`Proxy Error: Could not reach ${PROXY_ENDPOINT}. Ensure the Cloudflare Function is deployed correctly.`);
    }
    throw error;
  }
};