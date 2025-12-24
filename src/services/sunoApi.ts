import { ParsedSunoOutput, LyricAlignmentResponse } from "../types";

export const getSunoCredits = async (cookie: string): Promise<number> => {
    if (!cookie) throw new Error("No cookie provided");
    
    // Direct Suno billing endpoint
    const BILLING_ENDPOINT = "https://studio-api.prod.suno.com/api/billing/info/";
    
    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const trimmedCookie = cookie.trim();
        if (trimmedCookie.startsWith("ey")) {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        } else {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        }

        const response = await fetch(BILLING_ENDPOINT, {
            method: "GET",
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch credits. Status: ${response.status}`);
        }

        const data = await response.json();
        // Return total_credits_left or fallback to 0
        return typeof data.total_credits_left === 'number' ? data.total_credits_left : 0;
    } catch (error) {
        console.error("Failed to get credits:", error);
        throw error;
    }
};

export const getSunoFeed = async (cookie: string): Promise<any> => {
    if (!cookie) throw new Error("No cookie provided");

    // Direct Feed Endpoint
    const FEED_ENDPOINT = "https://studio-api.prod.suno.com/api/feed/v2?page=0";

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const trimmedCookie = cookie.trim();
        if (trimmedCookie.startsWith("ey")) {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        } else {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        }

        const response = await fetch(FEED_ENDPOINT, {
            method: "GET",
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch feed. Status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to get suno feed:", error);
        throw error;
    }
};

export const getLyricAlignment = async (songId: string, cookie: string): Promise<LyricAlignmentResponse> => {
    if (!cookie) throw new Error("No cookie provided");

    const ENDPOINT = `https://studio-api.prod.suno.com/api/gen/${songId}/aligned_lyrics/v2`;

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const trimmedCookie = cookie.trim();
        if (trimmedCookie.startsWith("ey")) {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        } else {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        }

        const response = await fetch(ENDPOINT, {
            method: "GET",
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch alignment. Status: ${response.status}`);
        }

        const data = await response.json();
        return data; // Expected to match LyricAlignmentResponse structure
    } catch (error) {
        console.error("Failed to get lyric alignment:", error);
        throw error;
    }
};

export const triggerSunoGeneration = async (
  data: ParsedSunoOutput, 
  cookie: string,
  model: string = "chirp-bluejay"
): Promise<any> => {
  if (!cookie) {
    throw new Error("Suno Cookie/Token is missing.");
  }

  // Use the proxy endpoint to avoid CORS issues and manage headers
  const API_ENDPOINT = "/api/suno-proxy";
  
  // Normalize 0-100 to 0.0-1.0
  const weirdness = typeof data.weirdness === 'number' ? data.weirdness / 100 : 0.5;
  const styleWeight = typeof data.styleInfluence === 'number' ? data.styleInfluence / 100 : 0.5;

  // Construct payload for Custom Mode
  const payload = {
    prompt: data.lyricsWithTags || "",
    tags: data.style || "",
    negative_tags: data.excludeStyles || "",
    title: data.title || "Suno Architect Generation",
    make_instrumental: !data.lyricsWithTags && !!data.style,
    mv: model, // Dynamic Model selection
    continue_clip_id: null,
    continue_at: null,
    generation_type: "TEXT",
    metadata: {
        create_mode: "custom",
        control_sliders: {
            weirdness_constraint: weirdness,
            style_weight: styleWeight
        },
        can_control_sliders: [
            "weirdness_constraint",
            "style_weight"
        ]
    }
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
        // If it's not a Bearer token (e.g. session cookie), send as X-Suno-Cookie
        // The proxy will convert this to the Cookie header
        headers["X-Suno-Cookie"] = trimmedCookie;
    }

    const response = await fetch(API_ENDPOINT, {
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
    console.error("Suno Proxy API Error:", error);
    throw error;
  }
};

export const updateSunoMetadata = async (clipId: string, data: ParsedSunoOutput, cookie: string): Promise<any> => {
    if (!cookie) throw new Error("No cookie provided");

    // Point to the metadata proxy
    const PROXY_ENDPOINT = `https://studio-api.prod.suno.com/api/gen/${clipId}/set_metadata/`;
    
    // Construct payload
    const payload = {
      "title": data.title || "Untitled",
      "lyrics": data.lyricsAlone || "", // Use clean lyrics
      "caption": "",
      "caption_mentions": {
        "user_mentions": []
      },
      "remove_image_cover": false,
      "remove_video_cover": false
    };

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        const trimmedCookie = cookie.trim();
        if (trimmedCookie.startsWith("ey")) {
             headers["Authorization"] = `Bearer ${trimmedCookie}`;
        } else {
             headers["X-Suno-Cookie"] = trimmedCookie;
        }

        const response = await fetch(PROXY_ENDPOINT, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             const errorText = await response.text();
             console.warn("Metadata update failed for " + clipId, errorText);
             return null;
        }
        
        return await response.json();
    } catch (e) {
        console.error("Failed to update metadata", e);
        return null; 
    }
};
