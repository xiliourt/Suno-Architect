
import { SunoLibrary, LyricalConstraints } from "./types";

export const SUNO_MODEL_MAPPINGS = [
  { label: "V5", value: "chirp-crow" },
  { label: "V4.5+", value: "chirp-bluejay" },
  { label: "V4.5", value: "chirp-auk" },
  { label: "V4", value: "chirp-v4" },
  { label: "V3.5", value: "chirp-v3-5" },
  { label: "V3", value: "chirp-v3-0" },
];
export const DEFAULT_SUNO_LIBRARY: SunoLibrary = {
  genres: ["Pop", "K-Pop", "J-Pop", "Synth-pop", "Rock", "Hard Rock", "Alt Rock", "Indie Rock", "Prog Rock", "Punk", "Metal", "Hip-Hop", "Rap", "Trap", "R&B", "Soul", "Drill", "EDM", "House", "Techno", "Trance", "Dubstep", "DnB", "Ambient", "Synthwave", "Folk", "Country", "Jazz", "Blues", "Classical", "Reggae", "Latin"],
  structures: ["[Intro]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Post-Chorus]", "[Bridge]", "[Outro]", "[Hook]", "[Instrumental Break]", "[Solo Section]", "[Guitar Solo]", "[Drop]", "[Build-up]", "[Spoken Word]"],
  vocalStyles: ["[Male Vocals]", "[Female Vocals]", "[Duet]", "[Choir]", "[Backing Vocals]", "[Powerful Vocals]", "[Whispered]", "[Rapping]", "[Screaming]", "[Growling]", "[Operatic]", "[Autotune]", "[Vocoder]", "[Reverb]", "[Delay]", "[Dry Vocals]"],
  production: ["[Reverb]", "[Delay]", "[Echo]", "[Distortion]", "[Overdrive]", "[Fuzz]", "[Bitcrush]", "[Chorus Effect]", "[Phaser]", "[Flanger]", "[Tremolo]", "[Lo-fi]", "[Hi-fi]", "[Vintage]", "[Wide Stereo]", "[Mono]"],
  theory: ["[Slow Tempo]", "[Medium Tempo]", "[Fast Tempo]", "[Variable Tempo]", "[Major Key]", "[Minor Key]", "[4/4]", "[3/4]", "[6/8]", "[Odd Meter]", "[ii-V-I]", "[Blues Progression]", "[Doo-wop]"]
};

export const DEFAULT_LYRICAL_CONSTRAINTS: LyricalConstraints = {
  forbidden: ["crown", "throne", "kingdom", "neon", "halo", "wings", "angels", "ghost", "chains", "shackles", "ashes", "embers", "flames", "void", "abyss", "maze", "labyrinth", "armor", "shield", "sword", "canvas", "storm", "mirror", "demons", "ruins", "echoes"],
  forbiddenAdjectives: ["endless", "eternal", "hollow", "broken", "shattered", "fading", "crimson", "golden", "empty", "frozen"],
  forbiddenPhrases: ["ghost in the machine", "rise from the ashes", "broken wings", "dance with the devil", "weight of the world", "heart of gold", "lost in the dark", "find the light", "walls come crashing down", "demons inside", "fire and ice", "bleeding heart", "written in the stars", "against all odds", "eye of the storm", "chasing dreams"],
  forbiddenRhymes: "fire/desire, heart/apart/start, night/light/fight/sight, pain/rain/vain, soul/whole/control, time/mind/blind, stay/away/day, breath/death, eyes/lies/skies, burn/turn/learn, fall/all/wall, tears/fears/years"
};

export const ASPECT_RATIOS = {
  "16:9": { width: 1280, height: 720, label: "Landscape (16:9)" },
  "9:16": { width: 720, height: 1280, label: "Portrait/TikTok (9:16)" },
  "1:1": { width: 1080, height: 1080, label: "Square (1:1)" },
  "4:3": { width: 1024, height: 768, label: "Classic (4:3)" }
};

export const AUDIO_BITRATES = [
    { label: "128 kbps (Standard)", value: 128000 },
    { label: "192 kbps (High)", value: 192000 },
    { label: "256 kbps (Very High)", value: 256000 },
    { label: "320 kbps (Master)", value: 320000 },
];

export const VISUALIZER_FONTS = [
    { label: "Inter (Modern Sans)", value: "Inter, sans-serif" },
    { label: "Montserrat (Geometric)", value: "Montserrat, sans-serif" },
    { label: "Roboto (Neutral)", value: "Roboto, sans-serif" },
    { label: "Lora (Serif)", value: "Lora, serif" },
    { label: "Courier Prime (Mono)", value: "'Courier Prime', monospace" },
];

/**
 * Dynamically builds the Knowledge Base string based on current settings.
 */
export const buildKnowledgeBase = (library: SunoLibrary): string => {
  return `
# SunoAI Music Generation Knowledge Base

## 1. Core Syntax & Functionality
**Meta Tags** act as creative instructions defining genre, mood, instruments, effects, and structure.

* **Lyric/Structure Tags:** Must be enclosed in square brackets (e.g., \`[Verse]\`, \`[Chorus]\`). These are placed directly within the lyrics text box to control the flow of the song.
* **Style Prompts:** Comma-separated lists used in the "Style" description field (e.g., \`Pop, Rock, Fast Tempo\`). Do not use brackets here.
* **Negative Prompting:** Elements can be explicitly excluded using the "Exclude Style" parameter.

---

## 2. Structural Tags (Lyric Field)
These tags dictate the architectural flow of the track.
${library.structures.join(", ")}

---

## 3. Style & Genre Definitions
${library.genres.join(", ")}

---

## 4. Instrumentation & Voice
**Vocal Styles:**
${library.vocalStyles.join(", ")}

---

## 5. Technical Production Tags
**Audio Effects:**
${library.production.join(", ")}

**Music Theory & Rhythm:**
${library.theory.join(", ")}

---

## 6. Advanced Generation Parameters
(Standard Suno Parameters: Exclude Styles, Vocal Gender, Weirdness, Style Influence)
**Style Influence (Token Weight):**
* 0-30% (Loose): Suggestions only.
* 40-65% (Balanced): Default recommendation.
* 70-80% (Strict): Required for complex timing (e.g., "7/8 time") or sub-genres.

---

## 7. Reference Examples
* **Psychedelic Rock:** Weirdness 60%, Style Influence 65%.
* **Modern EDM:** Weirdness 40%, Style Influence 70%, Exclude: Acoustic.
* **Indie Folk:** Weirdness 30%, Style Influence 50%, Exclude: Acoustic.
`;
};

/**
 * STRICT_OUTPUT_SUFFIX
 * Enforces the exact output format required by the parser.
 * Updated to handle instructions for multiple tracks.
 */
export const GET_STRICT_OUTPUT_SUFFIX = (numTracks: number) => `
*** CRITICAL RESPONSE FORMATTING RULES ***
You are generating exactly **${numTracks} tracks** for a cohesive album experience.
For EACH track, you must output exactly **6 separate code blocks** in this order:

--- TRACK [NUMBER] ---
1. Style: Comma-separated tags.
\`\`\`text
Genre, Mood, BPM...
\`\`\`

2. Title: Song title ONLY.
\`\`\`text
Song Title
\`\`\`

3. Exclude: Comma-separated tags to exclude.
\`\`\`text
None
\`\`\`

4. Parameters: Advanced generation settings.
\`\`\`text
Vocal Gender: [Male|Female|None]
Weirdness: [0-100]%
Style Influence: [0-100]%
\`\`\`

5. Lyrics: Full lyrics with embedded square-bracket tags \`[]\`.
\`\`\`text
[Intro]...
\`\`\`

6. Clean: Lyrics ONLY (no tags).
\`\`\`text
Lyrics text...
\`\`\`

Do not include any conversational text between tracks. Use the exact "--- TRACK [N] ---" header before each track set.
`;

/**
 * V1: The Classic Architect Prompt
 */
export const GET_PROMPT_V1 = (knowledgeBase: string): string => `
**Role & Objective:**
You are an expert Suno AI Prompt Engineer. Your goal is to assist users in creating professional-grade text prompts for AI music generation.

**Core Capabilities:**
1. **Meta Tag Mastery:** Deep knowledge of Suno-compatible style tags (Genre, Mood, Instrument, BPM, production effects).
2. **Lyric Structure:** Clear song structures (\`[Intro]\`, \`[Verse]\`, \`[Chorus]\`, \`[Bridge]\`, \`[Outro]\`).
3. **Audio Engineering:** Technical production tags (e.g., \`[Sidechain Compression]\`, \`[Wall of Sound]\`).
4. **Creative Rewriting:** Converting ideas into rhythmic, rhyming lyrics.
5. **Knowledge & Key Tag Reference**: 
${knowledgeBase}

**Guidelines:**
* Ensure tags in Block 1 are relevant to Suno (Genre, BPM, Mood).
* If generating an album, ensure thematic consistency across tracks while varying tempos and keys.
* If the user provides context, adapt the tone accordingly.
* Do not use [cite] tags.
`;

/**
 * V2: The strict Lyrical Architect
 */
export const GET_PROMPT_V2 = (knowledgeBase: string, constraints: LyricalConstraints): string => `
### SYSTEM ROLE
You are a master songwriter for SunoAI. Your goal is to write "Human-Level" lyrics that bypass common AI tropes and utilize specific technical meta-tags.

### KNOWLEDGE BASE
${knowledgeBase}

### PART 1: LYRICAL ARCHITECTURE (MANDATORY)
1. **Imagery:** Use concrete sensory details (the smell of old upholstery, the sound of a fridge hum). Avoid abstract concepts.
2. **Motion:** Use subtle verbs: *linger, drift, shift, slip, settle, press*.
3. **Lived-in Detail:** Include one unglamorous, specific object (a rusted paperclip, a lukewarm coffee).
4. **Meter:** Vary line lengths. Avoid symmetrical "nursery rhyme" structures.
5. **Punctuation:** Use standard punctuation. **ABSOLUTELY NO** hyphens at the end of lines. Use periods or commas.
6. **Subversion:** Set up a rhyme or phrase and then deliberately change the last word to something unexpected.

### PART 2: NEGATIVE CONSTRAINTS (THE "VOID" LIST)
Do NOT use the following, as they trigger "AI-detection" in listeners:
- **Forbidden Words:** ${constraints.forbidden.join(", ")}
- **Forbidden Adjectives:** ${constraints.forbiddenAdjectives.join(", ")}
- **Forbidden Phrases:** ${constraints.forbiddenPhrases.join(", ")}
- **Forbidden Rhymes:** ${constraints.forbiddenRhymes}
`;
