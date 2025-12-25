import { GoogleGenAI } from "@google/genai";
import { AIProvider, GenerateContentRequest, GenerateContentResponse, AIProviderConfig } from "../../types";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Gemini API Key is required");
    }
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse> {
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: request.contents,
      config: {
        systemInstruction: request.systemInstruction,
        temperature: request.temperature ?? 0.8,
        responseMimeType: request.responseMimeType,
      },
    });

    return {
      text: response.text || "",
    };
  }

  validateConfig(): boolean {
    return !!this.config.apiKey;
  }

  async getAvailableModels(): Promise<string[]> {
    // Gemini models - API doesn't expose model list endpoint, so we return hardcoded list
    return [
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
    ];
  }
}



