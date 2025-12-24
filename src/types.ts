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