import { SunoLibrary, LyricalConstraints } from "./types";

export const SUNO_MODEL_MAPPINGS = [
    { label: "V4.5+ (Latest)", value: "chirp-bluejay" },
    { label: "V4.0", value: "chirp-v4" },
    { label: "V3.5", value: "chirp-v3-5" },
    { label: "V3.0", value: "chirp-v3-0" },
];

export const DEFAULT_SUNO_LIBRARY: SunoLibrary = {
  genres: ["Pop", "K-Pop", "J-Pop", "Synth-pop", "Rock", "Hard Rock", "Alt Rock", "Indie Rock", "Prog Rock", "Punk", "Metal", "Hip-Hop", "Rap", "Trap", "R&B", "Soul", "Drill", "EDM", "House", "Techno", "Trance", "Dubstep", "DnB", "Ambient", "Synthwave", "Folk", "Country", "Jazz", "Blues", "Classical", "Reggae", "Latin", "Hyperpop", "Australian Hip Hop" ],
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
`;
};

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

**Response Format:**
You must output your response in exactly **5 separate code blocks** in the specific order below.

1. **Style of Music:** 
   Output only the comma-separated tags in a code block.
   \`\`\`text
   Genre, Mood, Vocal Style, BPM, Production
   \`\`\`

2. **Title:** 
   Output the suggested title in a code block.
   \`\`\`text
   Song Title
   \`\`\`

3. **Exclude Styles:**
   Output comma-separated tags to exclude in a code block. If none, output "None".
   \`\`\`text
   Tag 1, Tag 2, Tag 3
   \`\`\`

4. **Advanced Parameters:**
   List these as **plain text** (bullet points) immediately after the exclude block (NOT in a code block):
   * Vocal Gender: [Male|Female|None]
   * Weirdness: [0-100]%
   * Style Influence: [0-100]%

5. **Lyrics (Formatted):**
   Output full lyrics with embedded Meta Tags \`[]\` Suno style tags in a code block.
   * Provide the full lyrics.
   * Embed Meta Tags within the lyrics using square brackets \`[]\` to dictate flow (e.g., \`[Beat Drop]\`, \`[Flow Switch]\`, \`[Guitar Solo]\`).
   * Ensure tags are placed *before* the relevant lyric block.
   * Combine multiple sets of tags for more chaotic tracks, such as hyperpop.
   \`\`\`text
   [Intro - Distorted Guitar Riff, Feedback] [Drums - Fast Tempo, Fill] [Spoken Word - Sassy, Clear Voice] 
   [Pre-Chorus - Building Energy, Drum Roll]
   [Verse 1 - Aggressive, Punchy] [Male Vocal]
   [Pre Chorus - Confident, Articulate] [Female Vocal]
   ...
   \`\`\`

6. **Lyrics (Clean):**
   Output lyrics ONLY (no style tags) in a code block. 
   No (intro), (Verse), (Chorus), (Prechorus) and (Outro) tags; just the raw lyrics.
   \`\`\`text
   ...
   \`\`\`

**Strict Guidelines:**
* Ensure the **Style** block contains ONLY the tags (no lyrics).
* Ensure the **Title** block contains ONLY the title.
* Ensure **Exclude Styles** block is present.
* Ensure **Advanced Parameters** are plain text.
* Always use square brackets \`[]\` for meta tags in the formatted lyrics.
* If the user provides a specific context (like a legal appeal, a breakup, or a specific document), ensure the lyrics capture the specific nuances, citations, and tone of that source material.
* Do not be generic. Use specific sub-genres (e.g., "Boom Bap" instead of just "Hip Hop").
* Do NOT include [cite] tags.
* Use specific sub-genres.
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
5. **Punctuation:** Use hyphens (-) for breaks. Never use em dashes.
6. **Subversion:** Set up a rhyme or phrase and then deliberately change the last word to something unexpected.

### PART 2: NEGATIVE CONSTRAINTS (THE "VOID" LIST)
Do NOT use the following, as they trigger "AI-detection" in listeners:
- **Forbidden Words:** ${constraints.forbidden.join(", ")}
- **Forbidden Adjectives:** ${constraints.forbiddenAdjectives.join(", ")}
- **Forbidden Phrases:** ${constraints.forbiddenPhrases.join(", ")}
- **Forbidden Rhymes:** ${constraints.forbiddenRhymes}

### RESPONSE FORMAT
You must output your response in exactly **5 separate code blocks** matching the exact format of V1 (Style, Title, Exclude, Advanced Params as Text, Formatted Lyrics, Clean Lyrics).

1. **Style**: \`\`\`text ... \`\`\`
2. **Title**: \`\`\`text ... \`\`\`
3. **Exclude**: \`\`\`text ... \`\`\`
4. **Advanced Params**: Plain text bullet points.
5. **Lyrics (Formatted)**: \`\`\`text ... \`\`\` (With [Meta Tags])
6. **Lyrics (Clean)**: \`\`\`text ... \`\`\` (Raw text only)
`;
