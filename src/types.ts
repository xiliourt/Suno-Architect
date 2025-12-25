export interface ParsedSunoOutput {
  style: string;
  title: string;
  excludeStyles: string;
  advancedParams: string;
  vocalGender: string;
  weirdness: number;
  styleInfluence: number;
  lyricsWithTags: string;
  lyricsAlone: string;
  javascriptCode: string;
  fullResponse: string;
}

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  result: ParsedSunoOutput | null;
}

export interface SunoClip {
  id: string;
  title: string;
  created_at: string;
  model_name: string;
  imageUrl?: string;
  imageLargeUrl?: string;
  metadata: {
    tags: string;
    prompt: string;
  };
  originalData?: ParsedSunoOutput;
  alignmentData?: AlignedWord[];
  lrcContent?: string;
  srtContent?: string;
}

export interface AlignedWord {
  word: string;
  start_s: number;
  end_s: number;
  success: boolean;
  p_align: number;
}

export interface LyricAlignmentResponse {
  aligned_words: AlignedWord[];
}

export interface SunoLibrary {
  genres: string[];
  structures: string[];
  vocalStyles: string[];
  production: string[];
  theory: string[];
}

export interface LyricalConstraints {
  forbidden: string[];
  forbiddenAdjectives: string[];
  forbiddenPhrases: string[];
  forbiddenRhymes: string; // Keep as string for simple editing
}

export interface PromptSettings {
  version: 'v1' | 'v2' | 'custom';
  customSystemPrompt: string;
  library: SunoLibrary;
  constraints: LyricalConstraints;
}

export type ViewMode = 'generator' | 'history' | 'visualizer';

export type ProviderType = 'gemini' | 'openrouter' | 'openapi';

export interface AIProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
  authHeader?: string; // e.g., "Authorization", "X-API-Key", "x-litellm-api-key"
  authPrefix?: string; // e.g., "Bearer ", "ApiKey "
}

export interface GenerateContentRequest {
  model: string;
  contents: string;
  systemInstruction?: string;
  temperature?: number;
  responseMimeType?: string;
}

export interface GenerateContentResponse {
  text: string;
}

export interface AIProvider {
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;
  validateConfig(): boolean;
  getAvailableModels(): Promise<string[]>;
}