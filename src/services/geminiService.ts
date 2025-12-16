import { GoogleGenAI } from "@google/genai";
import { SUNO_SYSTEM_INSTRUCTION } from "../constants";
import { ParsedSunoOutput } from "../types";

export const generateSunoPrompt = async (userInput: string, customApiKey?: string): Promise<ParsedSunoOutput> => {
  const apiKey = customApiKey || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key is missing. Please set your Gemini API Key.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userInput,
      config: {
        systemInstruction: SUNO_SYSTEM_INSTRUCTION,
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
 * Parses the raw markdown response.
 * Expected structure (Based on SUNO_SYSTEM_INSTRUCTION):
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
  if (matches.length > 3) result.lyricsWithTags = matches[3];
  // 5. Lyrics (Clean)
  if (matches.length > 4) result.lyricsAlone = matches[4];

  // Extract Advanced Parameters (Plain text looking for specific keys)
  const paramLines = fullText.split('\n').filter(line => 
    line.toLowerCase().includes('vocal gender') || 
    line.toLowerCase().includes('weirdness') || 
    line.toLowerCase().includes('style influence')
  ).map(line => line.replace(/^\W+|\W+$/g, '').trim()); // Clean bullets

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