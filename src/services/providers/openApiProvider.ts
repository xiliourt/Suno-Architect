import { AIProvider, GenerateContentRequest, GenerateContentResponse, AIProviderConfig } from "../../types";

export class OpenAPIProvider implements AIProvider {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    if (!config.baseUrl) {
      throw new Error("OpenAPI baseUrl is required");
    }
    // Normalize baseUrl: remove trailing slashes
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
    };
  }

  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...this.config.headers,
    };

    // Add authentication header
    if (this.config.apiKey && this.config.authHeader) {
      const authValue = this.config.authPrefix 
        ? `${this.config.authPrefix}${this.config.apiKey}`
        : this.config.apiKey;
      headers[this.config.authHeader] = authValue;
    }

    // Build messages array
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

    // OpenAPI-compatible request format
    const body: any = {
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.8,
    };

    if (request.responseMimeType === "application/json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `OpenAPI error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
    };
  }

  validateConfig(): boolean {
    return !!this.config.baseUrl;
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.config.baseUrl) {
      return [];
    }

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json",
        ...this.config.headers,
      };

      // Add authentication header for models endpoint
      if (this.config.apiKey && this.config.authHeader) {
        const authValue = this.config.authPrefix 
          ? `${this.config.authPrefix}${this.config.apiKey}`
          : this.config.apiKey;
        headers[this.config.authHeader] = authValue;
      }

      const response = await fetch(`${this.config.baseUrl}/models?include_metadata=true`, {
        method: "GET",
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        // Handle different response formats
        if (Array.isArray(data)) {
          return data.map((m: any) => m.id || m.model || m.name).filter(Boolean);
        } else if (data.data && Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id || m.model || m.name).filter(Boolean);
        } else if (data.models && Array.isArray(data.models)) {
          return data.models.map((m: any) => m.id || m.model || m.name).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch OpenAPI models", e);
    }

    // Return empty array if we can't fetch models
    return [];
  }
}

