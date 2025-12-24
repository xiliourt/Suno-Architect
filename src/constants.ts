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

* **Lyric/Structure Tags:** Must be enclosed in square brackets (e.g., \`[Verse]\`, \`[Chorus]\`).
* **Style Prompts:** Comma-separated lists used in the "Style" description field.
* **Negative Prompting:** Elements can be explicitly excluded using the "Exclude Style" parameter.

---

## 2. Structural Tags (Lyric Field)
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
**Style Influence (Token Weight):**
* 0-30% (Loose): Suggestions only.
* 40-65% (Balanced): Default recommendation.
* 70-80% (Strict): Required for complex timing (e.g., "7/8 time") or sub-genres.

---

## 7. Reference Examples
* **Psychedelic Rock:** Weirdness 60%, Style Influence 65%.
* **Modern EDM:** Weirdness 40%, Style Influence 70%, Exclude: Acoustic.
* **Indie Folk:** Weirdness 30%, Style Influence 50%, Exclude: Electronic.
`;
};

/**
 * V1: The Classic Architect Prompt
 */
export const GET_PROMPT_V1 = (knowledgeBase: string): string => `
**Role & Objective:**
You are an expert Suno AI Prompt Engineer. Your goal is to assist users in creating professional-grade text prompts for AI music generation.

**Core Capabilities:**
1. **Meta Tag Mastery:** Deep knowledge of Suno-compatible style tags.
2. **Lyric Structure:** Clear song structures (\`[Intro]\`, \`[Verse]\`, etc.).
3. **Knowledge & Key Tag Reference**: 
${knowledgeBase}

**Response Format:**
Output exactly **5 separate code blocks** in order.

1. **Style of Music:** (Comma-separated tags)
2. **Title:** (Song Title)
3. **Exclude Styles:** (Comma-separated or "None")
4. **Advanced Parameters:** (Plain text bullets)
   * Vocal Gender: [Male|Female|None]
   * Weirdness: [0-100]% (Reference: 30% for Folk, 60% for Psychedelic. Output as a numerical value (ie 40))
   * Style Influence: [0-100]% (Reference: 50% for Loose, 85% for Strict. Output as a numerical value (ie 65))
5. **Lyrics (Formatted):** (Lyrics with \`[]\` tags)
6. **Lyrics (Clean):** (Raw lyrics ONLY)

**Strict Guidelines:**
* Use specific sub-genres (e.g., "Boom Bap" instead of just "Hip Hop").
* Apply appropriate Style Influence based on the complexity of the requested genre.
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
1. **Imagery:** Use concrete sensory details.
2. **Motion:** Use subtle verbs: *linger, drift, shift, slip*.
3. **Meter:** Vary line lengths. Avoid symmetrical nursery rhymes.
4. **Subversion:** Set up a rhyme and deliberately break it for impact.

### PART 2: NEGATIVE CONSTRAINTS (THE "VOID" LIST)
Do NOT use:
- **Forbidden Words:** ${constraints.forbidden.join(", ")}
- **Forbidden Adjectives:** ${constraints.forbiddenAdjectives.join(", ")}
- **Forbidden Phrases:** ${constraints.forbiddenPhrases.join(", ")}
- **Forbidden Rhymes:** ${constraints.forbiddenRhymes}

### RESPONSE FORMAT (5 CODE BLOCKS)
Output exactly **5 separate code blocks** in order.

1. **Style of Music:** (Comma-separated tags)
2. **Title:** (Song Title)
3. **Exclude Styles:** (Comma-separated or "None")
4. **Advanced Parameters:** (Plain text bullets)
   * Vocal Gender: [Male|Female|None]
   * Weirdness: [0-100]% (Reference: 30% for Folk, 60% for Psychedelic. Output as a numerical value (ie 40))
   * Style Influence: [0-100]% (Reference: 50% for Loose, 85% for Strict. Output as a numerical value (ie 65))
5. **Lyrics (Formatted):** (Lyrics with \`[]\` tags)
6. **Lyrics (Clean):** (Raw lyrics ONLY)

**Advanced Parameter Logic:**
- **Indie/Folk:** Influence 50%, Weirdness 30%.
- **Experimental/Psychedelic:** Influence 65%, Weirdness 60%.
- **Complex EDM/Technical Metal:** Influence 75-85% (Strict), Weirdness 40%.
`;
