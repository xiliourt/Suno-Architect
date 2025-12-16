# Suno Architect - Auto Generate Suno Prompts
- Uses Gemini Flash 2.5 (which supports free keys, see [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys))
- Generates
  - Song title
  - Suno style settings (weirdness %, style %, exclude, and male/female/none)
  - Lyrics including Suno tags
  - JavaScript pastable into console on Suno create page (autofills everything)
  - Lyrics without tag, copy pastable for elsewhere


## Deploy with Vercel instantly
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fxiliourt%2FSuno-Architect%2F)

Requires a gemini key, which can be set in the UI client side. see [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys)
- Ensure not to enable billing / to only use a 'free plan' key (it has enough usage for all this).

## Other Projects
- [Lyrical Sync](https://github.com/xiliourt/Lyrical-Sync/): A web music player supporting synced lrc files.
  - Supports cover photos, clicking lyrics to fast forward / rewind, etc.
  - Automatic detection of any mp3 files and Cover.png in subdirectories of the public folder
    - Generates og:metadata, shows the album on homepage, matches up the lrc and mp3 file, etc.
  - Last.fm support coming soon (Requires setting an API key and secret, so need to code it to fallback to no support)
  - Optional flac support coming soon (Requires attaching a Cloudflare bucket, fallsback to mp3 but need to make it hide button if unattached) 
- [LRCGen](https://lrcgen.xiliourt.ovh/): Auto generate lrc files from an mp3 file
  - Supports input of untimed lyrics to influence prompt and improve accruacy
  - Supports AI seperating of vocal track from audio _(improves accuracy at the cost of time and Gemini free balance usage)_
  - Supports setting maximum line length _(and having it as a hard or soft limit)_
  - Supports multiple tracks at a time _(with zip download, lrc's named the same as mp3s ready for Lyrical Sync)_
  - Supports manually retiming and editing lrc output synced with playback _(+/0 0.10 seconds at a time)_
