import { GoogleGenAI } from "@google/genai";
import { ParsedSunoOutput, AlignedWord, FileContext } from "../types";
import { STRICT_OUTPUT_SUFFIX } from "../constants";

export const generateSunoPrompt = async (
  userInput: string, 
  customApiKey?: string,
  systemInstruction?: string,
  geminiModel: string = "gemini-3-flash-preview",
  contextFile?: FileContext
): Promise<ParsedSunoOutput> => {
  const apiKey = customApiKey || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key is missing. Please set your Gemini API Key.");
  }

  const ai = new GoogleGenAI({ apiKey });

  if (!systemInstruction) {
      throw new Error("System Instruction is missing.");
  }

  // Enforce strict output format by appending the constant rule set
  const finalSystemInstruction = `${systemInstruction}\n\n${STRICT_OUTPUT_SUFFIX}`;

  try {
    const parts: any[] = [];
    
    // Add file context if present
    if (contextFile) {
        // Strip data URL prefix if present to get pure base64
        const base64Data = contextFile.data.includes(',') 
            ? contextFile.data.split(',')[1] 
            : contextFile.data;
            
        parts.push({
            inlineData: {
                mimeType: contextFile.mimeType,
                data: base64Data
            }
        });
        
        // Add a small hint about the file
        parts.push({ text: `[Context File Provided: ${contextFile.name}]` });
    }

    // Add user text prompt (even if empty string, though UI prevents that usually)
    if (userInput) {
        parts.push({ text: userInput });
    } else if (contextFile) {
        parts.push({ text: "Create a song based on this file context." });
    }

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: { parts },
      config: {
        systemInstruction: finalSystemInstruction,
        temperature: 0.8,
      },
    });

    const text = response.text || "";
    return parseResponse(text);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const msg = error.message || "Failed to generate prompt.";
    throw new Error(msg);
  }
};

/**
 * Groups aligned words into lines matching the original lyrics structure using Gemini.
 * Uses a hybrid approach: takes JavaScript-generated pseudo-lines as a draft, 
 * batches them to avoid token limits/timeouts, and uses AI to perfect the structure.
 */
export const groupLyricsByLines = async (
  lyrics: string,
  alignedWords: AlignedWord[],
  customApiKey?: string,
  modelName: string = "gemini-3-flash-preview",
  pseudoLines?: AlignedWord[][]
): Promise<AlignedWord[][]> => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key required for smart grouping.");

  // 1. Prepare Data
  // Round timestamps to 2 decimal places to significantly reduce token count.
  const allSimplifiedWords = alignedWords.map(w => ({ 
      w: w.word.trim(), 
      s: Number(w.start_s.toFixed(2)), 
      e: Number(w.end_s.toFixed(2)) 
  }));

  // If no pseudoLines provided, treat the whole list as one big line to start (fallback)
  // But ideally, VisualizerSection should always pass pseudoLines.
  const inputLines = pseudoLines && pseudoLines.length > 0 ? pseudoLines : [alignedWords];

  // 2. Batching Strategy
  // We cannot send 500+ words in one JSON prompt efficiently (latency/complexity).
  // We group pseudo-lines into batches of ~75 words.
  const BATCH_WORD_LIMIT = 75;
  const batches: any[][] = [];
  
  let currentBatch: any[] = [];
  let currentWordCount = 0;

  for (const line of inputLines) {
      // Simplify the line structure for the prompt
      const simplifiedLine = line.map(w => ({ 
          w: w.word.trim(), 
          s: Number(w.start_s.toFixed(2)), 
          e: Number(w.end_s.toFixed(2)) 
      }));

      // If adding this line exceeds limit, push current batch and start new
      if (currentWordCount + simplifiedLine.length > BATCH_WORD_LIMIT && currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentWordCount = 0;
      }
      
      currentBatch.push(simplifiedLine);
      currentWordCount += simplifiedLine.length;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // 3. Process Batches Sequentially (to avoid rate limits and ensure order)
  const finalLines: AlignedWord[][] = [];

  for (let i = 0; i < batches.length; i++) {
      const batchDraft = batches[i]; // Array of arrays (lines)
      
      try {
          const batchResult = await processBatchWithGemini(batchDraft, lyrics, apiKey, modelName, i, batches.length);
          finalLines.push(...batchResult);
      } catch (err) {
          console.error(`Batch ${i+1} failed, falling back to original draft for this section.`, err);
          // Fallback: convert the simplified batch draft back to full AlignedWord structure
          // We need to map back to the original objects in alignedWords to preserve exact precision if needed,
          // but reconstruction is fine for visualizer.
          const fallbackLines = batchDraft.map(line => line.map((s: any) => ({
              word: s.w,
              start_s: s.s,
              end_s: s.e,
              success: true,
              p_align: 1
          })));
          finalLines.push(...fallbackLines);
      }
  }

  return finalLines;
};

/**
 * Helper to process a single batch of words.
 */
const processBatchWithGemini = async (
    batchDraft: any[][], // Array of lines, where each line is array of {w,s,e}
    fullLyrics: string,
    apiKey: string,
    modelName: string,
    batchIndex: number,
    totalBatches: number
): Promise<AlignedWord[][]> => {
    const ai = new GoogleGenAI({ apiKey });

    // Pre-process full lyrics into lines to help Gemini match structure instantly
    // This JSON structure is easier for LLM to map against than raw text block
    const lyricLines = fullLyrics.split('\n').map(l => l.trim()).filter(l => l);
    const lyricMap = lyricLines.reduce((acc, line, i) => {
        acc[i + 1] = line;
        return acc;
    }, {} as Record<string, string>);

    const prompt = `
  Role: Lyric Synchronizer.
  Task: Map the "Audio Draft" words to the "Target Structure" lines.
  
  --- Target Structure (Visual Guide) ---
  ${JSON.stringify(lyricMap)}
  --- End Target ---
  
  --- Audio Draft (Batch ${batchIndex + 1}/${totalBatches}) ---
  ${JSON.stringify(batchDraft)}
  --- End Draft ---
  
  Instructions:
  1. The "Audio Draft" contains words with timestamps, but potentially incorrect line breaks.
  2. The "Target Structure" is the official lyrics.
  3. You are working on a specific segment (Batch ${batchIndex + 1} of ${totalBatches}).
  4. Your job is to correct the line breaks in the Audio Draft to match the Target Structure.
  5. **CRITICAL:** You MUST output EVERY word from the "Audio Draft". Do not skip words. Do not add words.
  6. Output JSON only: A list of lines, where each line is an array of word objects ({w, s, e}).
  
  Output JSON format:
  { "lines": [[{"w": "word", "s": 1.2, "e": 1.5}, ...], ...] }
  `;

    const response = await ai.models.generateContent({
        model: modelName, 
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            temperature: 0.1 
        }
    });

    const text = response.text || "{}";
    const json = JSON.parse(text);

    if (json.lines && Array.isArray(json.lines)) {
        return json.lines.map((line: any[]) => line.map((w: any) => ({
            word: w.w,
            start_s: w.s,
            end_s: w.e,
            success: true,
            p_align: 1
        })));
    }
    
    throw new Error("Invalid JSON structure from AI");
};

/**
 * Helper to remove trailing hyphens/dashes from end of lines
 * This fixes the issue where the model uses "-" as a caesura at line end.
 */
const cleanTrailingHyphens = (text: string): string => {
    if (!text) return "";
    // Matches any dash-like char at end of line (multiline)
    // - normal hyphen
    // – en dash
    // — em dash
    return text.replace(/[ \t]*[-–—]+[ \t]*$/gm, "");
};

/**
 * Parses the raw markdown response.
 * Expected structure (Based on STRICT_OUTPUT_SUFFIX):
 * Block 1: Style
 * Block 2: Title
 * Block 3: Exclude Styles
 * Text: Advanced Parameters (Vocal Gender, Weirdness, Style Influence)
 * Block 4: Lyrics with Tags
 * Block 5: Lyrics Alone
 */
const parseResponse = (fullText: string): ParsedSunoOutput => {
  const result: ParsedSunoOutput = {
    style: "",
    title: "",
    excludeStyles: "",
    advancedParams: "",
    vocalGender: "None",
    weirdness: 50,
    styleInfluence: 50,
    lyricsWithTags: "",
    lyricsAlone: "",
    javascriptCode: "",
    fullResponse: fullText,
  };

  const codeBlockRegex = /```(?:text|markdown)?\s*([\s\S]*?)\s*```/g;
  const matches: string[] = [];
  let match;
  while ((match = codeBlockRegex.exec(fullText)) !== null) {
    matches.push(match[1].trim());
  }

  // Map blocks based on fixed order requested in prompt
  // 1. Style
  if (matches.length > 0) result.style = matches[0];
  // 2. Title
  if (matches.length > 1) result.title = matches[1];
  // 3. Exclude Styles
  if (matches.length > 2) result.excludeStyles = matches[2] === "None" ? "" : matches[2];
  // 4. Lyrics (Formatted)
  if (matches.length > 3) result.lyricsWithTags = cleanTrailingHyphens(matches[3]);
  // 5. Lyrics (Clean)
  if (matches.length > 4) result.lyricsAlone = cleanTrailingHyphens(matches[4]);

  // Extract Advanced Parameters (Plain text looking for specific keys)
  // We use a cleaner that removes Markdown list characters (*, -) and leading whitespace, 
  // but preserves the end of the line (e.g. 50% or (Tenor))
  const paramLines = fullText.split('\n').filter(line => 
    line.toLowerCase().includes('vocal gender') || 
    line.toLowerCase().includes('weirdness') || 
    line.toLowerCase().includes('style influence')
  ).map(line => line.replace(/^[\s\*\-\u2022]+/, '').trim());

  if (paramLines.length > 0) {
    result.advancedParams = paramLines.join('\n');
    
    // Parse individual values for JS generation
    paramLines.forEach(line => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('vocal gender')) {
            const val = line.split(':')[1]?.trim();
            if (val) result.vocalGender = val;
        } else if (lowerLine.includes('weirdness')) {
             const val = line.match(/(\d+)/);
             if (val) result.weirdness = parseInt(val[1], 10);
        } else if (lowerLine.includes('style influence')) {
             const val = line.match(/(\d+)/);
             if (val) result.styleInfluence = parseInt(val[1], 10);
        }
    });
  }

  // Generate JS Code
  result.javascriptCode = generateJsCode(result);

  return result;
};

const generateJsCode = (data: ParsedSunoOutput): string => {
    return `
// --- Helper Function for Text Inputs ---
function setNativeValue(element, value) {
    if (!element) return;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
    
    if (valueSetter && valueSetter !== prototypeValueSetter) { prototypeValueSetter.call(element, value); } else { valueSetter.call(element, value); }
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

// --- Helper for Sliders ---
function adjustSlider(sliderText, targetValue) {
    const slider = document.querySelector(\`div[role="slider"][aria-label="\${sliderText}"]\`);
    if (slider) {
        slider.focus();
        const pressKey = (key) => {
            slider.dispatchEvent(new KeyboardEvent('keydown', { key: key, code: key, bubbles: true, cancelable: true }));
        };

        if (slider.dataset.intervalId) clearInterval(slider.dataset.intervalId);

        const interval = setInterval(() => {
            const currentVal = parseFloat(slider.getAttribute('aria-valuenow'));
            if (Math.abs(currentVal - targetValue) < 1) { clearInterval(interval); return; }
            if (currentVal > targetValue) { pressKey('ArrowLeft'); } 
            else if (currentVal < targetValue) { pressKey('ArrowRight'); } 
        }, 10);
        
        slider.dataset.intervalId = interval;
    } else { console.warn(\`Slider "\${sliderText}" not found.\`); }
}

// --- Helper for Gender Buttons ---
function setVocalGender(targetGender) {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        const internalSpan = btn.querySelector('span.relative.flex.flex-row.items-center.justify-center.gap-1');
        if (!internalSpan) continue;
        
        const label = internalSpan.textContent.trim();
        
        if (label === 'Male' || label === 'Female') {
            const isSelected = btn.getAttribute('data-selected') === 'true';
            let shouldBeSelected = false;
            
            if (targetGender === 'Male' && label === 'Male') shouldBeSelected = true;
            else if (targetGender === 'Female' && label === 'Female') shouldBeSelected = true;
            if (isSelected !== shouldBeSelected) { btn.click(); }
        }
    }
}


// --- MAIN EXECUTION ---
// 1. Set Text Fields
const lyricsBlock = document.querySelector('textarea[placeholder="Write some lyrics or a prompt — or leave blank for instrumental"]');
setNativeValue(lyricsBlock, ${JSON.stringify(data.lyricsWithTags)});

const stylesBlock = document.querySelectorAll('textarea')[1];
setNativeValue(stylesBlock, ${JSON.stringify(data.style)});

const excludeStyles = document.querySelector('input[placeholder="Exclude styles"]');
setNativeValue(excludeStyles, ${JSON.stringify(data.excludeStyles)});

const songTitle = document.querySelector('input[placeholder="Song Title (Optional)"]');
setNativeValue(songTitle, ${JSON.stringify(data.title)});

// 2. Set Sliders
adjustSlider('Weirdness', ${data.weirdness}); 
adjustSlider('Style Influence', ${data.styleInfluence});

// 3. Set Gender
setVocalGender('${data.vocalGender}');
`;
};

// --- LYRIC UTILITIES (Shared between Visualizer and History) ---

export const STOP_WORDS = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'it', 'is', 'that', 'you', 'he', 'she', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find']);

/**
 * Enhanced Helper: Filter out meta words AND repair fragmented tokens.
 */
export const getCleanAlignedWords = (aligned: AlignedWord[]): AlignedWord[] => {
    // Phase 1: Strip Brackets/Tags
    const clean: AlignedWord[] = [];
    let bracketDepth = 0;

    for (const w of aligned) {
        const originalWord = w.word;
        let cleanWordBuilder = "";
        
        for (let i = 0; i < originalWord.length; i++) {
            const char = originalWord[i];
            if (char === '[') {
                bracketDepth++;
                continue;
            }
            if (char === ']') {
                if (bracketDepth > 0) bracketDepth--;
                continue;
            }
            
            if (bracketDepth === 0) {
                cleanWordBuilder += char;
            }
        }
        
        const trimmed = cleanWordBuilder.trim();
        
        if (trimmed.length > 0) {
            clean.push({
                ...w,
                word: trimmed
            });
        }
    }

    // Phase 2: Repair Fragmentation (Phantom Spaces)
    if (clean.length === 0) return [];

    const fixed: AlignedWord[] = [];
    let current = clean[0];

    for (let i = 1; i < clean.length; i++) {
            const next = clean[i];
            const currText = current.word.trim();
            const nextText = next.word.trim();
            
            const isFragment = 
                /['’]$/.test(currText) || 
                /^['’]/.test(nextText) ||
                /^['’]+$/.test(currText) ||
                /^['’]+$/.test(nextText);
            
            const gap = next.start_s - current.end_s;
            
            if (isFragment && gap < 0.5) {
                current = {
                    ...current,
                    word: currText + nextText, 
                    end_s: next.end_s 
                };
            } else {
                fixed.push(current);
                current = next;
            }
    }
    fixed.push(current);
    
    return fixed;
};

export const stripMetaTags = (text: string): string => {
    if (!text) return "";
    return text
        .replace(/\[[\s\S]*?\]/g, '')
        .replace(/\([\s\S]*?\)/g, '')
        .replace(/\{[\s\S]*?\}/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
};

export const cleanStringForMatch = (s: string) => {
    if (!s) return "";
    try {
        return s.toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
    } catch (e) {
        return s.toLowerCase().replace(/['".,/#!$%^&*;:{}=\-_`~()]/g, "");
    }
};

export const groupWordsByTiming = (aligned: AlignedWord[]): AlignedWord[][] => {
    const cleanAligned = getCleanAlignedWords(aligned); 
    if (cleanAligned.length === 0) return [];
    const groups: AlignedWord[][] = [];
    let currentLine: AlignedWord[] = [];
    const GAP_THRESHOLD = 0.5;
    const MAX_CHARS = 40; 
    cleanAligned.forEach((word, idx) => {
        if (idx === 0) {
            currentLine.push(word);
            return;
        }
        const prevWord = cleanAligned[idx - 1];
        const timeGap = word.start_s - prevWord.end_s;
        const currentLen = currentLine.reduce((sum, w) => sum + w.word.length + 1, 0);
        const isGapBig = timeGap > GAP_THRESHOLD;
        const isLineLong = currentLen > MAX_CHARS;
        const endsClause = /[.,;!?]$/.test(prevWord.word);
        if (isGapBig || ((isLineLong || endsClause) && timeGap > 0.15)) {
            groups.push(currentLine);
            currentLine = [word];
        } else {
            currentLine.push(word);
        }
    });
    if (currentLine.length > 0) groups.push(currentLine);
    return groups;
};

export const matchWordsToPrompt = (aligned: AlignedWord[], promptText: string): AlignedWord[][] => {
    const cleanAligned = getCleanAlignedWords(aligned);
    if (cleanAligned.length === 0) return [];

    const promptLines = stripMetaTags(promptText)
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);
    
    if (promptLines.length === 0) return groupWordsByTiming(cleanAligned);

    type PromptToken = { text: string; lineIndex: number; isLineStart: boolean };
    const tokens: PromptToken[] = [];
    
    promptLines.forEach((line, idx) => {
        const words = line.split(/\s+/).map(cleanStringForMatch).filter(w => w.length > 0);
        words.forEach((w, wIdx) => tokens.push({ 
            text: w, 
            lineIndex: idx,
            isLineStart: wIdx === 0 
        }));
    });

    const groups: AlignedWord[][] = [];
    let currentGroup: AlignedWord[] = [];
    let currentLineIndex = 0;
    let tokenPtr = 0;
    let wordsSinceLastMatch = 0; 

    for (let i = 0; i < cleanAligned.length; i++) {
        const wordObj = cleanAligned[i];
        const cleanWord = cleanStringForMatch(wordObj.word);

        if (!cleanWord) {
            currentGroup.push(wordObj);
            continue;
        }

        let bestMatchOffset = -1;
        const isLost = wordsSinceLastMatch > 4; 
        const MAX_LOOKAHEAD = isLost ? 1000 : 200; 
        const searchLimit = Math.min(tokens.length - tokenPtr, MAX_LOOKAHEAD);

        for (let lookahead = 0; lookahead < searchLimit; lookahead++) {
            const target = tokens[tokenPtr + lookahead];
            const isExact = target.text === cleanWord;
            const isMatch = isExact || (!isLost && (target.text.includes(cleanWord) || cleanWord.includes(target.text)));

            if (isMatch) {
                let contextMatch = false;
                if (i + 1 < cleanAligned.length) {
                    const nextAudio = cleanStringForMatch(cleanAligned[i+1].word);
                    if (nextAudio) {
                            for (let offset = 1; offset <= 3; offset++) {
                                if (tokenPtr + lookahead + offset < tokens.length) {
                                    const nextToken = tokens[tokenPtr + lookahead + offset].text;
                                    if (nextToken === nextAudio || nextToken.includes(nextAudio) || nextAudio.includes(nextToken)) {
                                        contextMatch = true;
                                        break;
                                    }
                                }
                            }
                    } else {
                        contextMatch = true;
                    }
                }

                if (lookahead < 3) {
                    bestMatchOffset = lookahead;
                    break;
                }
                const isCommon = cleanWord.length < 3 || STOP_WORDS.has(cleanWord);
                if (contextMatch) {
                    bestMatchOffset = lookahead;
                    break;
                }
                if (isLost && !isCommon && isExact) {
                        if (target.isLineStart || lookahead < 20) {
                            bestMatchOffset = lookahead;
                            break;
                        }
                }
            }
        }

        if (bestMatchOffset !== -1) {
            const target = tokens[tokenPtr + bestMatchOffset];
            if (target.lineIndex > currentLineIndex) {
                if (currentGroup.length > 0) groups.push(currentGroup);
                currentGroup = [];
                currentLineIndex = target.lineIndex;
            }
            tokenPtr += bestMatchOffset + 1;
            wordsSinceLastMatch = 0; 
        } else {
            wordsSinceLastMatch++;
        }
        currentGroup.push(wordObj);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
};
