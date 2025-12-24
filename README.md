# Suno Architect - Auto Generate Suno Prompts
- Uses Gemini Flash 2.5 (which supports free keys, see [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys))
- Generates
  - Song title
  - Suno style settings (weirdness %, style %, exclude, and male/female/none)
  - Lyrics including Suno style tags
  - JavaScript pastable into console on Suno create page (autofills everything)
  - Lyrics without tags, copy pastable for elsewhere. Also used via the API below to remove tags in displayed lyrics.
- OPTIONAL: Utilises Suno API
  - Requires an easily obtainable token (which may expire at times)
  - Adds a button to send directly to the Suno API
  - Saves ID in 'history' tab to display image(s), links to suno tracks, download buttons, etc
  - Support for pulling the timed lyrics from Suno
  - Support for conversion of timed lyrics JSON to LRC or SRT
  - NOTE: _For some reason the main generation API is cors locked, requiring the worker. The rest is direct via browser)_

## Deploy with Cloudflare
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiliourt/Suno-Architect/)
