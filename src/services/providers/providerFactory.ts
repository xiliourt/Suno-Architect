import { AIProvider, AIProviderConfig } from "../../types";
import { GeminiProvider } from "./geminiProvider";
import { OpenRouterProvider } from "./openRouterProvider";
import { OpenAPIProvider } from "./openApiProvider";

export function createProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case "gemini":
      return new GeminiProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
    case "openapi":
      return new OpenAPIProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Validates provider configuration without creating a provider instance
 */
export function validateProviderConfig(config: AIProviderConfig): boolean {
  if (!config || !config.type) {
    return false;
  }

  switch (config.type) {
    case "gemini":
      return !!config.apiKey;
    case "openrouter":
      return !!config.apiKey;
    case "openapi":
      // OpenAPI needs baseUrl, apiKey is optional (can use custom auth)
      return !!config.baseUrl;
    default:
      return false;
  }
}

