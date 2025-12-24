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
