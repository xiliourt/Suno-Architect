import { AIProvider, GenerateContentRequest, GenerateContentResponse, AIProviderConfig } from "../../types";

export class OpenRouterProvider implements AIProvider {
  private config: AIProviderConfig;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error("OpenRouter API Key is required");
    }
    this.config = config;
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
  }

  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
      ...this.config.headers,
    };

    // Add HTTP-Referer and X-Title headers if not present (OpenRouter requirement)
    if (!headers["HTTP-Referer"]) {
      headers["HTTP-Referer"] = window.location.origin;
    }
    if (!headers["X-Title"]) {
      headers["X-Title"] = "Suno Architect";
    }

    const messages = [];
    if (request.systemInstruction) {
      messages.push({
        role: "system",
        content: request.systemInstruction,
      });
    }
    messages.push({
      role: "user",
      content: request.contents,
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model,
        messages,
        temperature: request.temperature ?? 0.8,
        response_format: request.responseMimeType === "application/json" 
          ? { type: "json_object" } 
          : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
    };
  }

  validateConfig(): boolean {
    return !!this.config.apiKey;
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      };

      const response = await fetch(`${this.baseUrl}/models`, {
        headers,
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.data?.map((m: any) => m.id) || [];
      }
    } catch (e) {
      console.warn("Failed to fetch OpenRouter models", e);
    }
    
    // Fallback to common models
    return [
      "openai/gpt-4o",
      "openai/gpt-4-turbo",
      "openai/gpt-3.5-turbo",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-pro-1.5",
    ];
  }
}



