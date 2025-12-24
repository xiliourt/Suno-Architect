import { GoogleGenAI } from "@google/genai";
import { ParsedSunoOutput, AlignedWord } from "../types";
import { STRICT_OUTPUT_SUFFIX } from "../constants";

export const generateSunoPrompt = async (
  userInput: string, 
  customApiKey?: string,
  systemInstruction?: string,
  geminiModel: string = "gemini-3-flash-preview"
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
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: userInput,
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
 */
export const groupLyricsByLines = async (
  lyrics: string,
  alignedWords: AlignedWord[],
  customApiKey?: string
): Promise<AlignedWord[][]> => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key required for smart grouping.");

  const ai = new GoogleGenAI({ apiKey });
  
  // SANITIZATION & OPTIMIZATION:
  // 1. Trim words to remove excess whitespace.
  // 2. Round timestamps to 2 decimal places to significantly reduce token count.
  // 3. This simplified structure helps the model process much faster.
  const simplifiedWords = alignedWords.map(w => ({ 
      w: w.word.trim(), 
      s: Number(w.start_s.toFixed(2)), 
      e: Number(w.end_s.toFixed(2)) 
  }));

  const prompt = `
  Task: Group the provided JSON aligned words into lines that match the visual structure of the Original Lyrics.

  Original Lyrics:
  """
  ${lyrics}
  """
  
  Aligned Words (JSON):
  ${JSON.stringify(simplifiedWords)}
  
  Instructions:
  1. Return a JSON Object with a single key "lines".
  2. "lines" must be an array of arrays (one array per lyric line).
  3. Place the aligned word objects into the correct line arrays.
  4. Preserve the exact "w", "s", "e" values.
  5. Do not invent words. Use the provided list.
  
  Expected Output Format: 
  { "lines": [[{ "w": "Hello", "s": 1.01, "e": 1.50 }, ...], ...] }
  `;

  try {
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash", // Fast model, good for JSON tasks
          contents: prompt,
          config: { 
              responseMimeType: "application/json",
              temperature: 0.1 // Lower temperature for more deterministic/structural tasks
          }
      });
      
      const text = response.text || "{}";
      const json = JSON.parse(text);
      if (json.lines && Array.isArray(json.lines)) {
          // Map back to full AlignedWord shape
          return json.lines.map((line: any[]) => line.map((w: any) => ({
              word: w.w,
              start_s: w.s,
              end_s: w.e,
              success: true,
              p_align: 1
          })));
      }
      return [];
  } catch (e) {
      console.error("Failed to parse grouping response", e);
      return [];
  }
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
}
