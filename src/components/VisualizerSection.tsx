import React, { useState, useEffect, useRef } from 'react';
import { SunoClip, AlignedWord } from '../types';
import { getLyricAlignment } from '../services/sunoApi';
import { groupLyricsByLines } from '../services/geminiService';
// @ts-ignore
import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from 'webm-muxer';

// Declarations for WebCodecs API
declare class AudioEncoder {
  constructor(init: { output: (chunk: any, meta: any) => void; error: (e: any) => void });
  configure(config: { codec: string; numberOfChannels: number; sampleRate: number; bitrate: number }): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
}

declare class AudioData {
  constructor(init: {
    format: string;
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    timestamp: number;
    data: Float32Array;
  });
  close(): void;
}

interface VisualizerSectionProps {
  history: SunoClip[];
  sunoCookie?: string;
  onUpdateClip: (id: string, updates: Partial<SunoClip>) => void;
  apiKey?: string;
  geminiModel?: string;
}

const ASPECT_RATIOS = {
  "16:9": { width: 1280, height: 720, label: "Landscape (16:9)" },
  "9:16": { width: 720, height: 1280, label: "Portrait/TikTok (9:16)" },
  "1:1": { width: 1080, height: 1080, label: "Square (1:1)" },
  "4:3": { width: 1024, height: 768, label: "Classic (4:3)" }
};

const VisualizerSection: React.FC<VisualizerSectionProps> = ({ history, sunoCookie, onUpdateClip, apiKey, geminiModel }) => {
  // Selection State
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [manualId, setManualId] = useState('');
  
  // Visual Settings
  const [aspectRatio, setAspectRatio] = useState<keyof typeof ASPECT_RATIOS>("16:9");
  const [customBg, setCustomBg] = useState<{ url: string, type: 'image' | 'video', name: string } | null>(null);
  const [imgSrc, setImgSrc] = useState<string>('');

  // Data State
  const [clipData, setClipData] = useState<SunoClip | null>(null);
  const [alignment, setAlignment] = useState<AlignedWord[] | null>(null);
  const [lines, setLines] = useState<AlignedWord[][]>([]);
  const [lyricSource, setLyricSource] = useState(''); // Text source for structure
  
  // Audio/Canvas/Media References
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const customVideoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [progress, setProgress] = useState(0); // Playback progress
  
  const audioContextRef = useRef<AudioContext | null>(null);

  /**
   * Enhanced Helper: Filter out meta words, handling split tags across multiple tokens.
   * Uses character-level state machine to handle cases like:
   * 1. "[Verse 1] Feel" -> "Feel"
   * 2. "0:22 [Intro] [" -> "0:23 Downtempo" -> "0:24 ]" (All removed)
   */
  const getCleanAlignedWords = (aligned: AlignedWord[]): AlignedWord[] => {
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
          
          // Only keep words that have actual content after stripping tags
          // We trim to ensure we don't keep just whitespace
          const trimmed = cleanWordBuilder.trim();
          
          if (trimmed.length > 0) {
              clean.push({
                  ...w,
                  word: trimmed
              });
          }
      }
      return clean;
  };

  /**
   * Helper: Remove [Meta Tags] and empty lines from text to get clean lyrics.
   */
  const stripMetaTags = (text: string): string => {
      if (!text) return "";
      return text
          .replace(/\[[\s\S]*?\]/g, '') // Remove [Verse], [Chorus]
          .replace(/\([\s\S]*?\)/g, '') // Remove (Ad-libs)
          .replace(/\{[\s\S]*?\}/g, '') // Remove {Tags}
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
  };

  /**
   * Algorithm: Match Aligned Words to Prompt Structure.
   * This uses the "Lyric Source" textbox as the source of truth for line breaks.
   */
  const matchWordsToPrompt = (aligned: AlignedWord[], promptText: string): AlignedWord[][] => {
      // Step 1: Clean the aligned words using robust depth check
      const cleanAligned = getCleanAlignedWords(aligned);
      if (cleanAligned.length === 0) return [];

      // Step 2: Prepare Prompt Lines (Structure Source)
      // We do NOT strictly strip meta tags here because if the user typed them in the box, 
      // they might want them (though usually we map words). 
      // However, we need to strip them to match the content of the audio (which doesn't speak "Verse").
      const promptLines = stripMetaTags(promptText)
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
      
      if (promptLines.length === 0) return groupWordsByTiming(cleanAligned);

      // Step 3: Tokenize the prompt
      type PromptToken = { text: string; lineIndex: number };
      const tokens: PromptToken[] = [];
      
      promptLines.forEach((line, idx) => {
          const words = line.toLowerCase().replace(/[^\w\s]|_/g, "").split(/\s+/).filter(w => w);
          words.forEach(w => tokens.push({ text: w, lineIndex: idx }));
      });

      const groups: AlignedWord[][] = [];
      let currentGroup: AlignedWord[] = [];
      let currentLineIndex = 0;
      let tokenPtr = 0;

      for (let i = 0; i < cleanAligned.length; i++) {
          const wordObj = cleanAligned[i];
          const cleanWord = wordObj.word.toLowerCase().replace(/[^\w\s]|_/g, "");

          if (!cleanWord) {
              currentGroup.push(wordObj);
              continue;
          }

          let matchFound = false;
          let lookahead = 0;
          const MAX_LOOKAHEAD = 5; // Increased lookahead

          while (tokenPtr + lookahead < tokens.length && lookahead < MAX_LOOKAHEAD) {
              const target = tokens[tokenPtr + lookahead];
              
              if (target.text === cleanWord || target.text.includes(cleanWord) || cleanWord.includes(target.text)) {
                  
                  // If we jumped to a new line index, push old group
                  if (target.lineIndex > currentLineIndex) {
                      if (currentGroup.length > 0) groups.push(currentGroup);
                      currentGroup = [];
                      
                      // Handle skipped empty lines in prompt (if any)
                      // Ideally we'd insert empty groups but visualizer skips them anyway
                      
                      currentLineIndex = target.lineIndex;
                  }

                  tokenPtr += lookahead + 1;
                  matchFound = true;
                  break; 
              }
              lookahead++;
          }

          currentGroup.push(wordObj);
      }

      if (currentGroup.length > 0) groups.push(currentGroup);
      
      return groups;
  };

  /**
   * Robust grouping based on timing gaps (Fallback).
   */
  const groupWordsByTiming = (aligned: AlignedWord[]): AlignedWord[][] => {
      // Pass aligned words through the cleaner first to ensure no partial/split tags remain
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

  // Handle Image Source Logic (Cache busting for CORS)
  useEffect(() => {
    if (!clipData) return;

    let url = clipData.imageLargeUrl || clipData.imageUrl || `https://cdn2.suno.ai/image_large_${clipData.id}.jpeg`;
    if (url.includes('suno.ai') && !url.includes('?')) {
        url += `?t=${Date.now()}`;
    }
    setImgSrc(url);
    
    // Set Lyric Source from clip data if empty
    if (!lyricSource) {
        const raw = clipData.originalData?.lyricsAlone || clipData.metadata?.prompt || "";
        setLyricSource(raw);
    }
  }, [clipData]);

  const handleImageError = () => {
      setImgSrc('https://placehold.co/1080x1080/1e293b/475569?text=No+Cover');
  };

  // Load Clip Data when ID changes
  useEffect(() => {
    if (!selectedClipId) return;
    setLines([]); 

    const fromHistory = history.find(c => c.id === selectedClipId);
    if (fromHistory) {
        setClipData(fromHistory);
        // Reset Lyric Source for new song
        const rawLyrics = fromHistory.originalData?.lyricsAlone || fromHistory.metadata?.prompt || "";
        setLyricSource(rawLyrics);

        if (fromHistory.alignmentData) {
            setAlignment(fromHistory.alignmentData);
            
            let autoLines;
            if (rawLyrics) {
                autoLines = matchWordsToPrompt(fromHistory.alignmentData, rawLyrics);
            } else {
                autoLines = groupWordsByTiming(fromHistory.alignmentData);
            }
            setLines(autoLines);

        } else if (sunoCookie && !fromHistory.id.startsWith('draft_')) {
             setIsPreparing(true);
             getLyricAlignment(fromHistory.id, sunoCookie)
                .then(res => {
                    if(res && res.aligned_words) {
                        setAlignment(res.aligned_words);
                        onUpdateClip(fromHistory.id, { alignmentData: res.aligned_words });
                        
                        let autoLines;
                        if(rawLyrics) {
                             autoLines = matchWordsToPrompt(res.aligned_words, rawLyrics);
                        } else {
                             autoLines = groupWordsByTiming(res.aligned_words);
                        }
                        setLines(autoLines);
                    }
                })
                .catch(err => console.error("Failed to fetch alignment for visualizer", err))
                .finally(() => setIsPreparing(false));
        }
    } else {
        setClipData({
            id: selectedClipId,
            title: '', 
            created_at: new Date().toISOString(),
            model_name: 'Unknown',
            imageUrl: `https://cdn2.suno.ai/image_large_${selectedClipId}.jpeg`,
            metadata: { tags: '', prompt: '' }
        });
        setLyricSource(""); // Reset for manual ID
        
        if (sunoCookie) {
             setIsPreparing(true);
             getLyricAlignment(selectedClipId, sunoCookie)
                .then(res => {
                     if(res && res.aligned_words) setAlignment(res.aligned_words);
                })
                .catch(err => console.error("Failed to fetch alignment for manual id", err))
                .finally(() => setIsPreparing(false));
        }
    }
  }, [selectedClipId, history, sunoCookie, onUpdateClip]);

  const handleManualLoad = () => {
      if (manualId.trim()) {
          setSelectedClipId(manualId.trim());
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const url = URL.createObjectURL(file);
        const type = file.type.startsWith('video') ? 'video' : 'image';
        setCustomBg({ url, type, name: file.name });
    }
  };

  const handleApplyLyrics = () => {
    if(!alignment) return;
    // Use the current lyricSource as the authority
    const newLines = matchWordsToPrompt(alignment, lyricSource);
    setLines(newLines);
  };

  const handleSmartGroup = async () => {
      if (!clipData || !alignment) return;
      
      const cleanLyrics = stripMetaTags(lyricSource);

      if (!cleanLyrics.trim()) {
          alert("No text lyrics found to group against.");
          return;
      }
      
      setIsGrouping(true);
      try {
          const cleanAligned = getCleanAlignedWords(alignment);
          
          // 1. JS Heuristics
          const pseudoLines = matchWordsToPrompt(alignment, lyricSource);
          setLines(pseudoLines);

          // 2. Gemini Refinement
          const grouped = await groupLyricsByLines(cleanLyrics, cleanAligned, apiKey, geminiModel, pseudoLines);
          
          if (grouped && grouped.length > 0) {
              setLines(grouped);
          } else {
             console.warn("AI couldn't group the lines. Keeping prompt-based structure.");
          }
      } catch (e) {
          console.error(e);
          alert("Failed to group lines with AI. Kept prompt-based grouping.");
      } finally {
          setIsGrouping(false);
      }
  };

  /**
   * Helper: Draw image/video covering the canvas (object-cover)
   */
  const drawCover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource | HTMLVideoElement | HTMLImageElement, w: number, h: number) => {
        let imgW = 0;
        let imgH = 0;

        if (img instanceof HTMLVideoElement) {
            imgW = img.videoWidth;
            imgH = img.videoHeight;
        } else if (img instanceof HTMLImageElement) {
            imgW = img.naturalWidth || img.width;
            imgH = img.naturalHeight || img.height;
        }

        if (!imgW || !imgH) return;

        const imgRatio = imgW / imgH;
        const winRatio = w / h;

        let drawW, drawH, startX, startY;

        if (imgRatio > winRatio) {
            // Image is wider than canvas -> crop sides
            drawH = h;
            drawW = h * imgRatio;
            startX = (w - drawW) / 2;
            startY = 0;
        } else {
            // Image is taller than canvas -> crop top/bottom
            drawW = w;
            drawH = w / imgRatio;
            startX = 0;
            startY = (h - drawH) / 2;
        }
        
        ctx.drawImage(img, startX, startY, drawW, drawH);
  };

  // --- DRAWING LOGIC ---
  const renderFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      // 1. Draw Background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      let drawn = false;

      // Try Custom Background first
      if (customBg) {
          if (customBg.type === 'video' && customVideoRef.current) {
              // Note: During offline render, the loop logic sets current time manually.
              // During preview, it just plays.
              drawCover(ctx, customVideoRef.current, width, height);
              drawn = true;
          } else if (customBg.type === 'image') {
              const customImg = document.getElementById('custom-bg-img') as HTMLImageElement;
              if (customImg && customImg.complete) {
                  drawCover(ctx, customImg, width, height);
                  drawn = true;
              }
          }
      }

      // Fallback to Default Suno Cover
      if (!drawn) {
        const bgImg = document.getElementById('source-img') as HTMLImageElement;
        if (bgImg && bgImg.complete) {
            drawCover(ctx, bgImg, width, height);
        }
      }

      // Overlay Dimmer
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; // Slightly lighter dim than before
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Text
      if (lines.length > 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Improved Active Line Logic
          let activeLineIdx = lines.findIndex(line => {
             if (line.length === 0) return false;
             const start = line[0].start_s;
             const end = line[line.length - 1].end_s;
             return time >= start && time <= end;
          });

          if (activeLineIdx === -1) {
              const upcomingIdx = lines.findIndex(line => line.length > 0 && line[0].start_s > time);
              if (upcomingIdx !== -1) {
                  const timeToStart = lines[upcomingIdx][0].start_s - time;
                  if (upcomingIdx === 0 && timeToStart > 4) {
                       activeLineIdx = -1; 
                  } else {
                       activeLineIdx = upcomingIdx;
                  }
              } else {
                  activeLineIdx = lines.length - 1;
              }
          }
          
          if (activeLineIdx === -1) {
               ctx.font = 'italic 24px Inter, sans-serif';
               ctx.fillStyle = 'rgba(255,255,255,0.2)';
               ctx.fillText("...", width / 2, height / 2);
          }

          // Measure Line Helper
          const measureLine = (idx: number, scale: number) => {
              if (idx < 0 || idx >= lines.length) return null;
              const line = lines[idx];
              // displayWords are already cleaned by getCleanAlignedWords logic upstream
              const displayWords = line;
              if (displayWords.length === 0) return null;

              let fontSize = 48 * scale;
              if (aspectRatio === "9:16") fontSize = 36 * scale; 
              
              ctx.font = `bold ${fontSize}px Inter, sans-serif`;
              const lineHeight = fontSize * 1.3;
              const maxW = width * 0.85;

              const wordsWithWidths = displayWords.map(w => ({
                  ...w,
                  width: ctx.measureText(w.word + " ").width
              }));

              const rows: { words: typeof wordsWithWidths, width: number }[] = [];
              let currentRow: typeof wordsWithWidths = [];
              let currentWidth = 0;

              wordsWithWidths.forEach(w => {
                  if (currentWidth + w.width > maxW && currentRow.length > 0) {
                      rows.push({ words: currentRow, width: currentWidth });
                      currentRow = [w];
                      currentWidth = w.width;
                  } else {
                      currentRow.push(w);
                      currentWidth += w.width;
                  }
              });
              if (currentRow.length > 0) {
                  rows.push({ words: currentRow, width: currentWidth });
              }
              
              const totalHeight = rows.length * lineHeight;
              return { rows, totalHeight, lineHeight, fontSize };
          };

          // Draw Line Helper
          const drawLine = (layout: any, centerY: number, alpha: number, isActive: boolean) => {
              if (!layout) return;
              
              ctx.font = `bold ${layout.fontSize}px Inter, sans-serif`;
              
              // startY is the top of the first line in the block
              // We want the block centered at centerY
              const startY = centerY - ((layout.rows.length - 1) * layout.lineHeight) / 2;

              layout.rows.forEach((row: any, rowIdx: number) => {
                  const rowY = startY + (rowIdx * layout.lineHeight);
                  let currentX = (width - row.width) / 2;

                  row.words.forEach((w: any) => {
                      const isWordActive = time >= w.start_s && time <= w.end_s;
                      const isWordPast = time > w.end_s;

                      if (isActive) {
                         if (isWordActive) {
                             ctx.fillStyle = '#e879f9'; 
                             ctx.shadowColor = '#d946ef'; 
                             ctx.shadowBlur = 25;
                         } else if (isWordPast) {
                             ctx.fillStyle = '#f1f5f9'; 
                             ctx.shadowBlur = 0;
                         } else {
                             ctx.fillStyle = 'rgba(255,255,255,0.3)'; 
                             ctx.shadowBlur = 0;
                         }
                      } else {
                          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                          ctx.shadowBlur = 0;
                      }

                      ctx.textAlign = 'left';
                      ctx.fillText(w.word, currentX, rowY);
                      currentX += w.width;
                  });
              });
              ctx.shadowBlur = 0;
          };

          // Calculate Layouts
          const activeLayout = measureLine(activeLineIdx, 1.2);
          const prev1Layout = measureLine(activeLineIdx - 1, 0.8);
          const prev2Layout = measureLine(activeLineIdx - 2, 0.6);
          const next1Layout = measureLine(activeLineIdx + 1, 0.8);
          const next2Layout = measureLine(activeLineIdx + 2, 0.6);

          const PADDING = aspectRatio === "9:16" ? 40 : 25;
          const centerY = height / 2;

          // Draw Active
          if (activeLayout) drawLine(activeLayout, centerY, 1, true);

          // Draw Previous Lines (Stacked Upwards)
          if (prev1Layout) {
              const activeH = activeLayout ? activeLayout.totalHeight : 0;
              // Center of Prev1 = (Top of Active - Padding) - Half of Prev1
              const prev1Y = centerY - (activeH / 2) - PADDING - (prev1Layout.totalHeight / 2);
              drawLine(prev1Layout, prev1Y, 0.5, false);

              if (prev2Layout) {
                  const prev2Y = prev1Y - (prev1Layout.totalHeight / 2) - PADDING - (prev2Layout.totalHeight / 2);
                  drawLine(prev2Layout, prev2Y, 0.2, false);
              }
          }

          // Draw Next Lines (Stacked Downwards)
          if (next1Layout) {
               const activeH = activeLayout ? activeLayout.totalHeight : 0;
               // Center of Next1 = (Bottom of Active + Padding) + Half of Next1
               const next1Y = centerY + (activeH / 2) + PADDING + (next1Layout.totalHeight / 2);
               drawLine(next1Layout, next1Y, 0.5, false);

               if (next2Layout) {
                   const next2Y = next1Y + (next1Layout.totalHeight / 2) + PADDING + (next2Layout.totalHeight / 2);
                   drawLine(next2Layout, next2Y, 0.2, false);
               }
          }

      } else if (alignment) {
          // Fallback if no grouping
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cleanAligned = getCleanAlignedWords(alignment);

          const activeIndex = cleanAligned.findIndex(w => time >= w.start_s && time <= w.end_s);
          const upcomingIndex = cleanAligned.findIndex(w => w.start_s > time);
          
          let baseIndex = activeIndex !== -1 ? activeIndex : (upcomingIndex !== -1 ? upcomingIndex : cleanAligned.length - 1);
          if (baseIndex < 0) baseIndex = 0;

          const startWindow = Math.max(0, baseIndex - 1);
          const endWindow = Math.min(cleanAligned.length, baseIndex + 3);
          const wordsToShow = cleanAligned.slice(startWindow, endWindow);
          const startY = (height / 2) + 50;
          const lineHeight = 60;

          wordsToShow.forEach((wordObj, i) => {
               const absoluteIndex = startWindow + i;
               const isCurrent = absoluteIndex === activeIndex;
               ctx.font = isCurrent ? 'bold 56px Inter, sans-serif' : '500 42px Inter, sans-serif';
               ctx.fillStyle = isCurrent ? '#e879f9' : '#475569'; 
               ctx.shadowColor = isCurrent ? '#d946ef' : 'transparent';
               ctx.shadowBlur = isCurrent ? 20 : 0;
               
               ctx.fillText(wordObj.word, width / 2, startY + (i * lineHeight) - (isCurrent ? 10 : 0));
          });
          ctx.shadowBlur = 0;
      }

      // Title & Progress Bar
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      
      const titleY = aspectRatio === "9:16" ? 120 : 60;
      if (clipData?.title) {
          ctx.fillText(clipData.title, width / 2, titleY);
      }

      if (clipData && audioRef.current && audioRef.current.duration) {
          const pct = time / audioRef.current.duration;
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(0, height - 8, width * pct, 8);
      }
  };

  // Preview Loop
  const animate = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      // Sync video playback during preview
      if (!isRendering && customBg?.type === 'video' && customVideoRef.current && audioRef.current) {
         if(!audioRef.current.paused && customVideoRef.current.paused) customVideoRef.current.play();
         if(audioRef.current.paused && !customVideoRef.current.paused) customVideoRef.current.pause();
      }

      if (!isRendering && audioRef.current && canvas && ctx) {
          const dims = ASPECT_RATIOS[aspectRatio];
          renderFrame(ctx, dims.width, dims.height, audioRef.current.currentTime);
          setProgress(audioRef.current.currentTime);
          requestRef.current = requestAnimationFrame(animate);
      }
  };

  useEffect(() => {
      if (selectedClipId && !isRendering) {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
          requestRef.current = requestAnimationFrame(animate);
      }
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, [selectedClipId, alignment, lines, isRendering, aspectRatio, customBg]);

  // --- OFFLINE RENDERING LOGIC ---
  const startOfflineRender = async () => {
    if (!clipData || !audioRef.current || !canvasRef.current) return;
    
    // Pause any preview playback
    audioRef.current.pause();
    if(customVideoRef.current) customVideoRef.current.pause();

    setIsRendering(true);
    setRenderProgress(0);

    let fileHandle: any = null;
    let writableStream: any = null;

    try {
        // 1. Fetch & Decode Audio
        const audioSrc = audioRef.current.src;
        const response = await fetch(audioSrc);
        const arrayBuffer = await response.arrayBuffer();
        
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;

        // 2. Output Dimensions from Selection
        const { width: targetWidth, height: targetHeight } = ASPECT_RATIOS[aspectRatio];

        // 3. Setup Muxer with FileSystem Strategy if available
        const filename = `${(clipData.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${aspectRatio.replace(':','-')}.webm`;
        let muxerTarget: any;

        // Try direct disk streaming if browser supports it
        if ('showSaveFilePicker' in window) {
            try {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'WebM Video',
                        accept: { 'video/webm': ['.webm'] },
                    }],
                });
                writableStream = await fileHandle.createWritable();
                muxerTarget = new FileSystemWritableFileStreamTarget(writableStream);
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    setIsRendering(false);
                    return;
                }
                console.warn("File System Access failed, falling back to RAM.", err);
            }
        }

        if (!muxerTarget) {
            muxerTarget = new ArrayBufferTarget();
        }

        const muxer = new Muxer({
            target: muxerTarget,
            video: {
                codec: 'V_VP9',
                width: targetWidth,
                height: targetHeight
            },
            audio: {
                codec: 'A_OPUS',
                numberOfChannels: 2,
                sampleRate: 48000
            }
        });

        // 4. Setup Video Encoder
        // @ts-ignore
        const videoEncoder = new VideoEncoder({
            output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
            error: (e: any) => console.error("Video Encoder error", e)
        });
        videoEncoder.configure({
            codec: 'vp09.00.10.08',
            width: targetWidth,
            height: targetHeight,
            bitrate: 4_000_000, // 4Mbps
            framerate: 30
        });

        // 5. Setup Audio Encoder
        // @ts-ignore
        const audioEncoder = new AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (e: any) => console.error("Audio Encoder error", e)
        });
        audioEncoder.configure({
            codec: 'opus',
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 128000
        });

        // 6. Render Video Frames with BACKPRESSURE
        const fps = 30;
        const totalFrames = Math.ceil(duration * fps);
        const ctx = canvasRef.current.getContext('2d')!;
        
        // Ensure canvas matches target dims for the render pass
        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;

        for (let i = 0; i < totalFrames; i++) {
            if (videoEncoder.encodeQueueSize > 5) {
                while (videoEncoder.encodeQueueSize > 2) {
                    await new Promise(r => setTimeout(r, 10));
                }
            }

            const t = i / fps;

            // Sync Background Video if present
            if (customBg?.type === 'video' && customVideoRef.current) {
                const vid = customVideoRef.current;
                const loopTime = t % vid.duration;
                // Only seek if difference is significant to avoid stutter or redundant seeks
                if (Math.abs(vid.currentTime - loopTime) > 0.1) {
                    vid.currentTime = loopTime;
                    // Wait for seek to complete to ensure frame is available
                    await new Promise<void>(resolve => {
                         const onSeek = () => {
                             vid.removeEventListener('seeked', onSeek);
                             resolve();
                         };
                         vid.addEventListener('seeked', onSeek);
                         // Fallback if event doesn't fire immediately (unlikely in robust browser envs but good safety)
                         // setTimeout(onSeek, 50); 
                    });
                }
            }

            renderFrame(ctx, targetWidth, targetHeight, t);
            
            // @ts-ignore
            const frame = new VideoFrame(canvasRef.current, { timestamp: t * 1000000 });
            
            videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
            frame.close();

            // Yield to UI periodically
            if (i % 15 === 0) {
                setRenderProgress((i / totalFrames) * 100);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // 7. Encode Audio (Same as before)
        const numberOfChannels = 2;
        const sourceChannels = audioBuffer.numberOfChannels;
        const audioDataLength = audioBuffer.length;
        const sourceSampleRate = audioBuffer.sampleRate;
        
        const getChannelData = (channel: number) => {
             if (channel < sourceChannels) return audioBuffer.getChannelData(channel);
             return audioBuffer.getChannelData(0);
        };

        const chunkFrames = 48000;
        for (let offset = 0; offset < audioDataLength; offset += chunkFrames) {
            const end = Math.min(offset + chunkFrames, audioDataLength);
            const frames = end - offset;
            const data = new Float32Array(frames * numberOfChannels);
            
            for (let ch = 0; ch < numberOfChannels; ch++) {
                const srcData = getChannelData(ch);
                const chunkData = srcData.subarray(offset, end);
                data.set(chunkData, ch * frames);
            }

            // @ts-ignore
            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: sourceSampleRate,
                numberOfFrames: frames,
                numberOfChannels: numberOfChannels,
                timestamp: (offset / sourceSampleRate) * 1000000,
                data: data
            });

            audioEncoder.encode(audioData);
            audioData.close();
        }

        await videoEncoder.flush();
        await audioEncoder.flush();
        muxer.finalize();

        if (writableStream) {
            await writableStream.close();
        } else {
            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

    } catch (e) {
        console.error("Offline render failed", e);
        alert("Render failed. Your browser might not support WebCodecs or there was a data error.");
    } finally {
        setIsRendering(false);
        setRenderProgress(0);
        requestRef.current = requestAnimationFrame(animate);
    }
  };


  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto space-y-8">
        
        {/* Header / Selector */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                 <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Lyric Video Visualizer</h2>
                    <p className="text-sm text-slate-400">Generate a high-quality WebM lyric video (Offline Render).</p>
                 </div>
                 
                 <div className="flex gap-2 w-full md:w-auto">
                      <select 
                        value={selectedClipId}
                        onChange={(e) => setSelectedClipId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500 block w-full md:w-64"
                      >
                          <option value="">Select from History...</option>
                          {history.filter(c => !c.id.startsWith('draft_')).map(c => (
                              <option key={c.id} value={c.id}>{c.title || c.id}</option>
                          ))}
                      </select>
                 </div>
             </div>

             <div className="flex gap-2 items-center pt-4 border-t border-slate-700/50">
                <input 
                    type="text" 
                    placeholder="Or paste Suno ID / UUID manually..." 
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2.5 flex-1"
                />
                <button 
                    onClick={handleManualLoad}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
                >
                    Load ID
                </button>
             </div>
        </div>

        {/* Main Content */}
        {selectedClipId && clipData && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 
                 {/* Left: Controls & Info */}
                 <div className="lg:col-span-1 space-y-6">
                     
                     {/* Metadata / Lyric Source Card */}
                     <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg">
                        <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lyrics & Structure Source</h3>
                            <button 
                                onClick={handleApplyLyrics}
                                disabled={!alignment}
                                className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded transition-colors disabled:opacity-50"
                                title="Update lines based on this text"
                            >
                                Apply Structure
                            </button>
                        </div>
                        <div className="p-2">
                             <textarea 
                                value={lyricSource}
                                onChange={(e) => setLyricSource(e.target.value)}
                                className="w-full h-40 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-purple-500 outline-none custom-scrollbar resize-none leading-relaxed"
                                placeholder="Paste lyrics here. Use newlines to determine how lines are grouped in the visualizer."
                             />
                             <p className="text-[10px] text-slate-500 mt-2 px-1">
                                <strong>Tip:</strong> This text determines line breaks. Aligning is fuzzy; edit text to fix grouping issues.
                             </p>
                        </div>
                     </div>

                     {/* Visual Settings Card */}
                     <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg p-4 space-y-4">
                         {/* Cover Art */}
                         <div className="relative group rounded-lg overflow-hidden border border-slate-700/50">
                             <img 
                                id="source-img"
                                src={imgSrc} 
                                alt="Cover" 
                                crossOrigin="anonymous" // CRITICAL FOR CANVAS EXPORT
                                onError={handleImageError}
                                className={`w-full h-32 object-cover ${customBg ? 'opacity-50' : 'opacity-100'}`}
                             />
                             {customBg && (
                                 <div className="absolute inset-0 flex items-center justify-center">
                                      {customBg.type === 'video' ? (
                                         <div className="bg-black/70 p-2 rounded-full">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5m-3.75-13.5H9m3 0h3.75M9 18.75H5.25m8.25 0h3.75" />
                                            </svg>
                                         </div>
                                      ) : (
                                          <img src={customBg.url} className="w-full h-full object-cover" alt="custom" />
                                      )}
                                      <button 
                                        onClick={() => setCustomBg(null)}
                                        className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full shadow-lg hover:bg-red-500"
                                        title="Remove Custom BG"
                                      >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                          </svg>
                                      </button>
                                 </div>
                             )}
                             
                             {/* Hidden Custom Media Elements */}
                             {customBg?.type === 'image' && (
                                 <img 
                                    id="custom-bg-img"
                                    src={customBg.url}
                                    className="hidden"
                                    crossOrigin="anonymous"
                                    alt="custom-bg"
                                 />
                             )}
                             <video 
                                 ref={customVideoRef}
                                 src={customBg?.type === 'video' ? customBg.url : ''}
                                 className="hidden"
                                 crossOrigin="anonymous"
                                 muted
                                 playsInline
                                 loop
                             />
                         </div>

                         {/* Settings */}
                         <div className="space-y-3">
                                 {/* Aspect Ratio Selector */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Aspect Ratio</label>
                                     <select 
                                        value={aspectRatio}
                                        onChange={(e) => setAspectRatio(e.target.value as keyof typeof ASPECT_RATIOS)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white focus:ring-1 focus:ring-purple-500"
                                     >
                                         {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                                             <option key={key} value={key}>{val.label} ({val.width}x{val.height})</option>
                                         ))}
                                     </select>
                                 </div>

                                 {/* File Upload */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Custom Background</label>
                                     <label className="flex items-center justify-center w-full px-2 py-2 border border-dashed border-slate-600 rounded cursor-pointer hover:bg-slate-800 transition-colors group bg-slate-900/50">
                                         <input 
                                            type="file" 
                                            accept="image/png, image/jpeg, image/webp, video/mp4, video/webm" 
                                            className="hidden" 
                                            onChange={handleFileUpload}
                                         />
                                         <div className="flex items-center gap-2 text-slate-400 group-hover:text-white">
                                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                 <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                             </svg>
                                             <span className="text-xs">Upload Image / Loop</span>
                                         </div>
                                     </label>
                                 </div>
                         </div>
                     </div>
                     
                     {/* AI Controls */}
                     <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-2 h-2 rounded-full ${alignment ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className="text-xs text-slate-300">
                                        {alignment ? `${alignment.length} words synced` : 'No alignment data found'}
                                    </span>
                                </div>
                                
                                {alignment && (
                                     <button 
                                        onClick={handleSmartGroup}
                                        disabled={isGrouping || isRendering}
                                        className="w-full py-2 bg-slate-700 hover:bg-purple-600 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                     >
                                         {isGrouping ? (
                                             <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                             </svg>
                                         ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                <path d="M3 3v5h5" />
                                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                                <path d="M16 16h5v5" />
                                            </svg>
                                         )}
                                         Refine Lines with AI
                                     </button>
                                )}
                             </div>
                             
                             {!alignment && sunoCookie && (
                                 <p className="text-xs text-yellow-500 mt-2">
                                     Attempts to fetch alignment happen automatically. If red, ensure you are logged in and this is your song.
                                 </p>
                             )}
                     </div>

                     {/* Audio Player (Hidden visually but used for logic) */}
                     <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 hidden">
                         <audio 
                            ref={audioRef} 
                            controls 
                            src={`https://cdn1.suno.ai/${selectedClipId}.mp3`}
                            crossOrigin="anonymous" // CRITICAL FOR RECORDING
                            className="w-full h-8"
                         />
                     </div>

                     {/* Action Button */}
                     <button
                        onClick={startOfflineRender}
                        disabled={isPreparing || !alignment || isRendering}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                        ${isRendering 
                            ? 'bg-purple-800 text-white cursor-wait' 
                            : !alignment 
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                     >
                         {isRendering ? (
                             <>
                                <span className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></span>
                                Rendering {Math.round(renderProgress)}%
                             </>
                         ) : (
                             <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
                                </svg>
                                Fast Export (.webm)
                             </>
                         )}
                     </button>
                     {isRendering && (
                         <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-2">
                             <div className="bg-purple-500 h-full transition-all duration-300" style={{ width: `${renderProgress}%` }}></div>
                         </div>
                     )}
                     {!isRendering && (
                         <p className="text-xs text-center text-slate-400">
                             Renders at ~10x speed. <br/>
                             <span className="text-purple-400">Tip:</span> Use Chrome/Edge for direct-to-disk streaming (Low RAM mode).
                         </p>
                     )}
                 </div>

                 {/* Right: Canvas Preview */}
                 <div className="lg:col-span-2 space-y-4">
                     <div className="bg-black border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzIyMiI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiB4PSIwIiB5PSIwIiBmaWxsPSIjMzMzIi8+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiB4PSIxMCIgeT0iMTAiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')]">
                         <canvas 
                            ref={canvasRef}
                            // Set actual resolution based on ratio
                            width={ASPECT_RATIOS[aspectRatio].width}
                            height={ASPECT_RATIOS[aspectRatio].height}
                            // Scale via CSS to fit container
                            className="max-w-full max-h-[70vh] w-auto h-auto object-contain shadow-2xl"
                         />
                         
                         {/* Overlay when preparing */}
                         {isPreparing && (
                             <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                                 <div className="flex flex-col items-center">
                                     <svg className="animate-spin h-8 w-8 text-purple-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-white text-sm font-medium">Fetching Assets...</span>
                                 </div>
                             </div>
                         )}
                     </div>
                     <div className="flex justify-between items-center text-xs text-slate-500 font-mono bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                         <span>{ASPECT_RATIOS[aspectRatio].label} • {ASPECT_RATIOS[aspectRatio].width}x{ASPECT_RATIOS[aspectRatio].height} • 30fps</span>
                         <div className="flex items-center gap-4">
                             {audioRef.current && (
                                <span className="text-purple-400">
                                    {Math.floor(progress / 60)}:{(Math.floor(progress) % 60).toString().padStart(2, '0')} 
                                    / 
                                    {Math.floor(audioRef.current.duration / 60)}:{(Math.floor(audioRef.current.duration) % 60).toString().padStart(2, '0')}
                                </span>
                             )}
                             <span>{isRendering ? 'RENDERING' : 'PREVIEW'}</span>
                         </div>
                     </div>
                     
                     {/* Audio Controls for Preview */}
                     <div className="flex gap-2">
                        <button 
                            onClick={() => {
                                if(audioRef.current) {
                                    if(audioRef.current.paused) audioRef.current.play();
                                    else audioRef.current.pause();
                                }
                            }}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                            </svg>
                            Play / Pause
                        </button>
                        <button 
                            onClick={() => {
                                if(audioRef.current) audioRef.current.currentTime = 0;
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-6 rounded-xl border border-slate-700 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                        </button>
                     </div>
                 </div>
             </div>
        )}
        
        {!selectedClipId && (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 opacity-20 mb-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
                <p>Select a song from history or enter an ID to start.</p>
            </div>
        )}
    </div>
  );
};

export default VisualizerSection;
