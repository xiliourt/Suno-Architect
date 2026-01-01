import { GoogleGenAI } from "@google/genai";
import { ParsedSunoOutput, AlignedWord, FileContext } from "../types";
import { STRICT_OUTPUT_SUFFIX } from "../constants";

export const generateSunoPrompt = async (
  userInput: string, 
  customApiKey?: string,
  systemInstruction?: string,
  geminiModel: string = "gemini-3-flash-preview",
  contextFiles: FileContext[] = []
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
    
    // Add multiple files to context
    let hasAudio = false;
    contextFiles.forEach(file => {
        const base64Data = file.data.includes(',') 
            ? file.data.split(',')[1] 
            : file.data;
            
        parts.push({
            inlineData: {
                mimeType: file.mimeType,
                data: base64Data
            }
        });
        
        if (file.mimeType.startsWith('audio/')) {
            hasAudio = true;
        }
    });

    // Add prompt hints based on content
    if (hasAudio) {
        parts.push({ text: `[CRITICAL: Audio files are provided as Style References. Analyze their tempo, instrumentation, genre, and production characteristics to influence the generated Suno prompt.]` });
    }

    if (contextFiles.length > 0) {
        const fileNames = contextFiles.map(f => f.name).join(', ');
        parts.push({ text: `[Context Files Provided: ${fileNames}]` });
    }

    // Add user text prompt
    if (userInput) {
        parts.push({ text: userInput });
    } else if (contextFiles.length > 0) {
        parts.push({ text: "Generate a professional Suno AI prompt based on the provided context files." });
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
  const allSimplifiedWords = alignedWords.map(w => ({ 
      w: w.word.trim(), 
      s: Number(w.start_s.toFixed(2)), 
      e: Number(w.end_s.toFixed(2)) 
  }));

  const inputLines = pseudoLines && pseudoLines.length > 0 ? pseudoLines : [alignedWords];

  // 2. Batching Strategy
  const BATCH_WORD_LIMIT = 75;
  const batches: any[][] = [];
  
  let currentBatch: any[] = [];
  let currentWordCount = 0;

  for (const line of inputLines) {
      const simplifiedLine = line.map(w => ({ 
          w: w.word.trim(), 
          s: Number(w.start_s.toFixed(2)), 
          e: Number(w.end_s.toFixed(2)) 
      }));

      if (currentWordCount + simplifiedLine.length > BATCH_WORD_LIMIT && currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentWordCount = 0;
      }
      
      currentBatch.push(simplifiedLine);
      currentWordCount += simplifiedLine.length;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  const finalLines: AlignedWord[][] = [];

  for (let i = 0; i < batches.length; i++) {
      const batchDraft = batches[i];
      
      try {
          const batchResult = await processBatchWithGemini(batchDraft, lyrics, apiKey, modelName, i, batches.length);
          finalLines.push(...batchResult);
      } catch (err) {
          console.error(`Batch ${i+1} failed, falling back to original draft for this section.`, err);
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

const processBatchWithGemini = async (
    batchDraft: any[][], 
    fullLyrics: string,
    apiKey: string,
    modelName: string,
    batchIndex: number,
    totalBatches: number
): Promise<AlignedWord[][]> => {
    const ai = new GoogleGenAI({ apiKey });
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

const cleanTrailingHyphens = (text: string): string => {
    if (!text) return "";
    return text.replace(/[ \t]*[-–—]+[ \t]*$/gm, "");
};

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

  if (matches.length > 0) result.style = matches[0];
  if (matches.length > 1) result.title = matches[1];
  if (matches.length > 2) result.excludeStyles = matches[2] === "None" ? "" : matches[2];
  if (matches.length > 3) result.lyricsWithTags = cleanTrailingHyphens(matches[3]);
  if (matches.length > 4) result.lyricsAlone = cleanTrailingHyphens(matches[4]);

  const paramLines = fullText.split('\n').filter(line => 
    line.toLowerCase().includes('vocal gender') || 
    line.toLowerCase().includes('weirdness') || 
    line.toLowerCase().includes('style influence')
  ).map(line => line.replace(/^[\s\*\-\u2022]+/, '').trim());

  if (paramLines.length > 0) {
    result.advancedParams = paramLines.join('\n');
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

  result.javascriptCode = generateJsCode(result);
  return result;
};

const generateJsCode = (data: ParsedSunoOutput): string => {
    return `
function setNativeValue(element, value) {
    if (!element) return;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
    if (valueSetter && valueSetter !== prototypeValueSetter) { prototypeValueSetter.call(element, value); } else { valueSetter.call(element, value); }
    element.dispatchEvent(new Event('input', { bubbles: true }));
}
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
    }
}
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
const lyricsBlock = document.querySelector('textarea[placeholder="Write some lyrics or a prompt — or leave blank for instrumental"]');
setNativeValue(lyricsBlock, ${JSON.stringify(data.lyricsWithTags)});
const stylesBlock = document.querySelectorAll('textarea')[1];
setNativeValue(stylesBlock, ${JSON.stringify(data.style)});
const excludeStyles = document.querySelector('input[placeholder="Exclude styles"]');
setNativeValue(excludeStyles, ${JSON.stringify(data.excludeStyles)});
const songTitle = document.querySelector('input[placeholder="Song Title (Optional)"]');
setNativeValue(songTitle, ${JSON.stringify(data.title)});
adjustSlider('Weirdness', ${data.weirdness}); 
adjustSlider('Style Influence', ${data.styleInfluence});
setVocalGender('${data.vocalGender}');
`;
};

export const STOP_WORDS = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'it', 'is', 'that', 'you', 'he', 'she', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find']);

export const getCleanAlignedWords = (aligned: AlignedWord[]): AlignedWord[] => {
    const clean: AlignedWord[] = [];
    let bracketDepth = 0;
    for (const w of aligned) {
        const originalWord = w.word;
        let cleanWordBuilder = "";
        for (let i = 0; i < originalWord.length; i++) {
            const char = originalWord[i];
            if (char === '[') { bracketDepth++; continue; }
            if (char === ']') { if (bracketDepth > 0) bracketDepth--; continue; }
            if (bracketDepth === 0) cleanWordBuilder += char;
        }
        const trimmed = cleanWordBuilder.trim();
        if (trimmed.length > 0) {
            clean.push({ ...w, word: trimmed });
        }
    }
    if (clean.length === 0) return [];
    const fixed: AlignedWord[] = [];
    let current = clean[0];
    for (let i = 1; i < clean.length; i++) {
            const next = clean[i];
            const currText = current.word.trim();
            const nextText = next.word.trim();
            const isFragment = /['’]$/.test(currText) || /^['’]/.test(nextText) || /^['’]+$/.test(currText) || /^['’]+$/.test(nextText);
            const gap = next.start_s - current.end_s;
            if (isFragment && gap < 0.5) {
                current = { ...current, word: currText + nextText, end_s: next.end_s };
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
        if (idx === 0) { currentLine.push(word); return; }
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
    const promptLines = stripMetaTags(promptText).split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (promptLines.length === 0) return groupWordsByTiming(cleanAligned);
    type PromptToken = { text: string; lineIndex: number; isLineStart: boolean };
    const tokens: PromptToken[] = [];
    promptLines.forEach((line, idx) => {
        const words = line.split(/\s+/).map(cleanStringForMatch).filter(w => w.length > 0);
        words.forEach((w, wIdx) => tokens.push({ text: w, lineIndex: idx, isLineStart: wIdx === 0 }));
    });
    const groups: AlignedWord[][] = [];
    let currentGroup: AlignedWord[] = [];
    let currentLineIndex = 0;
    let tokenPtr = 0;
    let wordsSinceLastMatch = 0; 
    for (let i = 0; i < cleanAligned.length; i++) {
        const wordObj = cleanAligned[i];
        const cleanWord = cleanStringForMatch(wordObj.word);
        if (!cleanWord) { currentGroup.push(wordObj); continue; }
        let bestMatchOffset = -1;
        const isLost = wordsSinceLastMatch > 4; 
        const MAX_LOOKAHEAD = isLost ? 1000 : 200; 
        const searchLimit = Math.min(tokens.length - tokenPtr, MAX_LOOKAHEAD);
        for (let lookahead = 0; lookahead < searchLimit; lookahead++) {
            const target = tokens[tokenPtr + lookahead];
            const isMatch = target.text === cleanWord || (!isLost && (target.text.includes(cleanWord) || cleanWord.includes(target.text)));
            if (isMatch) {
                let contextMatch = false;
                if (i + 1 < cleanAligned.length) {
                    const nextAudio = cleanStringForMatch(cleanAligned[i+1].word);
                    if (nextAudio) {
                            for (let offset = 1; offset <= 3; offset++) {
                                if (tokenPtr + lookahead + offset < tokens.length) {
                                    const nextToken = tokens[tokenPtr + lookahead + offset].text;
                                    if (nextToken === nextAudio || nextToken.includes(nextAudio) || nextAudio.includes(nextToken)) { contextMatch = true; break; }
                                }
                            }
                    } else { contextMatch = true; }
                }
                if (lookahead < 3 || contextMatch) { bestMatchOffset = lookahead; break; }
                if (isLost && !STOP_WORDS.has(cleanWord) && target.text === cleanWord) {
                        if (target.isLineStart || lookahead < 20) { bestMatchOffset = lookahead; break; }
                }
            }
        }
        if (bestMatchOffset !== -1) {
            const target = tokens[tokenPtr + bestMatchOffset];
            if (target.lineIndex > currentLineIndex) { if (currentGroup.length > 0) groups.push(currentGroup); currentGroup = []; currentLineIndex = target.lineIndex; }
            tokenPtr += bestMatchOffset + 1;
            wordsSinceLastMatch = 0; 
        } else { wordsSinceLastMatch++; }
        currentGroup.push(wordObj);
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    return groups;
};