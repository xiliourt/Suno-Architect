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
  geminiModel?: string; // Add this prop
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
   * Helper: Check if a word is a meta tag (contains brackets).
   */
  const isMetaWord = (word: string) => {
    return word.includes('[') || word.includes(']');
  };

  /**
   * Helper: Remove [Meta Tags] and empty lines from text to get clean lyrics.
   * Completely removes [] blocks including content.
   */
  const stripMetaTags = (text: string): string => {
      if (!text) return "";
      return text
          .replace(/\[[\s\S]*?\]/g, '') // Remove [Verse], [Chorus] and contents completely, including multiline
          .replace(/\([\s\S]*?\)/g, '') // Remove (Ad-libs)
          .replace(/\{[\s\S]*?\}/g, '') // Remove {Tags}
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
  };

  /**
   * Robust grouping based on timing gaps and character count.
   * This creates the "Pseudo-lines" for the AI.
   * 
   * UPDATED: Using tighter thresholds to favor over-splitting (smaller chunks)
   * which are easier for AI to merge than under-splitting.
   */
  const groupWordsByTiming = (aligned: AlignedWord[]): AlignedWord[][] => {
      const cleanAligned = aligned.filter(w => !isMetaWord(w.word));
      if (cleanAligned.length === 0) return [];

      const groups: AlignedWord[][] = [];
      let currentLine: AlignedWord[] = [];
      
      const GAP_THRESHOLD = 0.5;  // Reduced from 0.65 to capture tighter pauses
      const MAX_CHARS = 40;       // Reduced from 45 to break long lines earlier

      cleanAligned.forEach((word, idx) => {
          if (idx === 0) {
              currentLine.push(word);
              return;
          }

          const prevWord = cleanAligned[idx - 1];
          const timeGap = word.start_s - prevWord.end_s;
          
          // Calculate current line length (approx)
          const currentLen = currentLine.reduce((sum, w) => sum + w.word.length + 1, 0);

          const isGapBig = timeGap > GAP_THRESHOLD;
          const isLineLong = currentLen > MAX_CHARS;
          // Check for punctuation at end of previous word (if present in data)
          const endsClause = /[.,;!?]$/.test(prevWord.word);

          // Force break if gap is big, OR if line is long/punctuated AND there is at least a small gap
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

    // Prefer large image, then standard, then constructed
    let url = clipData.imageLargeUrl || clipData.imageUrl || `https://cdn2.suno.ai/image_large_${clipData.id}.jpeg`;
    
    // Add cache buster if it's a Suno URL to prevent CORS errors from cached opaque responses
    if (url.includes('suno.ai') && !url.includes('?')) {
        url += `?t=${Date.now()}`;
    }
    
    setImgSrc(url);
  }, [clipData]);

  const handleImageError = () => {
      // Fallback placeholder
      setImgSrc('https://placehold.co/1080x1080/1e293b/475569?text=No+Cover');
  };

  // Load Clip Data when ID changes
  useEffect(() => {
    if (!selectedClipId) return;
    setLines([]); // Reset lines on change

    // Check history first
    const fromHistory = history.find(c => c.id === selectedClipId);
    if (fromHistory) {
        setClipData(fromHistory);
        
        if (fromHistory.alignmentData) {
            setAlignment(fromHistory.alignmentData);
            // Use time-based grouping by default for accuracy
            const autoLines = groupWordsByTiming(fromHistory.alignmentData);
            setLines(autoLines);
        } else if (sunoCookie && !fromHistory.id.startsWith('draft_')) {
             setIsPreparing(true);
             getLyricAlignment(fromHistory.id, sunoCookie)
                .then(res => {
                    if(res && res.aligned_words) {
                        setAlignment(res.aligned_words);
                        onUpdateClip(fromHistory.id, { alignmentData: res.aligned_words });
                        const autoLines = groupWordsByTiming(res.aligned_words);
                        setLines(autoLines);
                    }
                })
                .catch(err => console.error("Failed to fetch alignment for visualizer", err))
                .finally(() => setIsPreparing(false));
        }
    } else {
        setClipData({
            id: selectedClipId,
            title: '', // Removed default 'Suno Track' branding
            created_at: new Date().toISOString(),
            model_name: 'Unknown',
            imageUrl: `https://cdn2.suno.ai/image_large_${selectedClipId}.jpeg`,
            metadata: { tags: '', prompt: '' }
        });
        
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

  const handleSmartGroup = async () => {
      if (!clipData || !alignment) return;
      
      let rawLyrics = clipData.originalData?.lyricsAlone || clipData.metadata?.prompt || "";
      
      // Fallback: If no metadata lyrics found (common in manual ID loads), construct from alignment words
      if (!rawLyrics || rawLyrics.trim() === "") {
          if (alignment.length > 0) {
              rawLyrics = alignment.map(w => w.word).join(' ');
          }
      }

      const cleanLyrics = stripMetaTags(rawLyrics);

      if (!cleanLyrics.trim()) {
          alert("No text lyrics found to group against.");
          return;
      }
      
      setIsGrouping(true);
      try {
          const cleanAligned = alignment.filter(w => !isMetaWord(w.word));
          
          // 1. JS Heuristics: Generate "Pseudo-lines" based on timing first
          const pseudoLines = groupWordsByTiming(cleanAligned);

          // 2. Gemini Refinement: Pass pseudo-lines as a hint to the AI
          const grouped = await groupLyricsByLines(cleanLyrics, cleanAligned, apiKey, geminiModel, pseudoLines);
          
          if (grouped && grouped.length > 0) {
              setLines(grouped);
          } else {
              alert("AI couldn't group the lines. Falling back to simple timing.");
              setLines(pseudoLines);
          }
      } catch (e) {
          console.error(e);
          alert("Failed to group lines with AI.");
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

          const renderLine = (lineIdx: number, offsetY: number, scale: number, alpha: number) => {
             if (lineIdx < 0 || lineIdx >= lines.length) return;
             const line = lines[lineIdx];
             const displayWords = line.filter(w => !isMetaWord(w.word));
             if (displayWords.length === 0) return;

             const centerY = (height / 2) + offsetY;
             
             let fontSize = 48 * scale;
             // Adjust font size for vertical video
             if (aspectRatio === "9:16") fontSize = 36 * scale; 

             ctx.font = `bold ${fontSize}px Inter, sans-serif`;
             
             let totalWidth = 0;
             const measurements = displayWords.map(w => {
                 const m = ctx.measureText(w.word + " ");
                 totalWidth += m.width;
                 return m.width;
             });
             
             const maxW = width * 0.9;
             if (totalWidth > maxW) {
                 const ratio = maxW / totalWidth;
                 fontSize *= ratio;
                 ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                 totalWidth = 0;
                 measurements.forEach((_, i) => {
                     const m = ctx.measureText(displayWords[i].word + " ");
                     measurements[i] = m.width;
                     totalWidth += m.width;
                 });
             }
             
             let currentX = (width - totalWidth) / 2;

             displayWords.forEach((w, i) => {
                 const isWordActive = time >= w.start_s && time <= w.end_s;
                 const isWordPast = time > w.end_s;
                 
                 if (lineIdx === activeLineIdx) {
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
                 ctx.fillText(w.word, currentX, centerY);
                 currentX += measurements[i];
             });
             ctx.shadowBlur = 0;
          };

          const spacing = aspectRatio === "9:16" ? 100 : 80;

          renderLine(activeLineIdx, 0, 1.2, 1);
          renderLine(activeLineIdx - 1, -spacing, 0.8, 0.5);
          renderLine(activeLineIdx - 2, -(spacing * 1.8), 0.6, 0.2);
          renderLine(activeLineIdx + 1, spacing, 0.8, 0.5);
          renderLine(activeLineIdx + 2, (spacing * 1.8), 0.6, 0.2);

      } else if (alignment) {
          // Fallback if no grouping
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const cleanAligned = alignment.filter(w => !isMetaWord(w.word));

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
                     {/* Metadata Card */}
                     <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg">
                         <img 
                            id="source-img"
                            src={imgSrc} 
                            alt="Cover" 
                            crossOrigin="anonymous" // CRITICAL FOR CANVAS EXPORT
                            onError={handleImageError}
                            className={`w-full aspect-square object-cover ${customBg ? 'hidden' : 'block'}`}
                         />
                         
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

                         {customBg && (
                             <div className="w-full h-48 bg-slate-900 flex flex-col items-center justify-center border-b border-slate-700 relative overflow-hidden">
                                {customBg.type === 'video' ? (
                                    <div className="text-center p-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 text-purple-400">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5m-3.75-13.5H9m3 0h3.75M9 18.75H5.25m8.25 0h3.75" />
                                        </svg>
                                        <span className="text-xs text-white block truncate max-w-[200px]">{customBg.name}</span>
                                        <span className="text-[10px] text-slate-500 uppercase">Video Background</span>
                                    </div>
                                ) : (
                                    <img src={customBg.url} className="w-full h-full object-cover opacity-80" alt="preview" />
                                )}
                                <button 
                                    onClick={() => setCustomBg(null)}
                                    className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-full shadow-lg"
                                    title="Remove Custom Background"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                </button>
                             </div>
                         )}

                         <div className="p-4 space-y-4">
                             <div>
                                <h3 className="font-bold text-white text-lg truncate">{clipData.title}</h3>
                                <p className="text-xs text-slate-400 font-mono mb-4">{clipData.id}</p>
                             </div>

                             {/* Visualizer Settings */}
                             <div className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visual Settings</h4>
                                 
                                 {/* Aspect Ratio Selector */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Aspect Ratio</label>
                                     <select 
                                        value={aspectRatio}
                                        onChange={(e) => setAspectRatio(e.target.value as keyof typeof ASPECT_RATIOS)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs text-white focus:ring-1 focus:ring-purple-500"
                                     >
                                         {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                                             <option key={key} value={key}>{val.label} ({val.width}x{val.height})</option>
                                         ))}
                                     </select>
                                 </div>

                                 {/* File Upload */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Custom Background</label>
                                     <label className="flex items-center justify-center w-full px-2 py-2 border border-dashed border-slate-600 rounded cursor-pointer hover:bg-slate-800 transition-colors group">
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
                             
                             <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${alignment ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                    <span className="text-xs text-slate-300">
                                        {alignment ? `${alignment.length} words synced` : 'No alignment data found'}
                                    </span>
                                </div>
                                
                                {alignment && (
                                     <button 
                                        onClick={handleSmartGroup}
                                        disabled={isGrouping || isRendering}
                                        className="mt-2 w-full py-2 bg-slate-700 hover:bg-purple-600 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                     >
                                         {isGrouping ? (
                                             <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                             </svg>
                                         ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                                <path d="M4 21v-7" />
                                                <path d="M4 10V3" />
                                                <path d="M12 21v-9" />
                                                <path d="M12 8V3" />
                                                <path d="M20 21v-5" />
                                                <path d="M20 12V3" />
                                                <path d="M1 14h6" />
                                                <path d="M9 8h6" />
                                                <path d="M17 16h6" />
                                            </svg>
                                         )}
                                         Smart Group Lines (AI)
                                     </button>
                                )}
                             </div>
                             
                             {!alignment && sunoCookie && (
                                 <p className="text-xs text-yellow-500 mt-2">
                                     Attempts to fetch alignment happen automatically. If red, ensure you are logged in and this is your song.
                                 </p>
                             )}
                         </div>
                     </div>

                     {/* Audio Player (Hidden visually but used for logic) */}
                     <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                         <p className="text-xs font-bold text-slate-500 uppercase mb-2">Preview Audio</p>
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
                 <div className="lg:col-span-2">
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
                     <div className="mt-2 flex justify-between text-xs text-slate-500 font-mono">
                         <span>{ASPECT_RATIOS[aspectRatio].label} • {ASPECT_RATIOS[aspectRatio].width}x{ASPECT_RATIOS[aspectRatio].height} • 30fps</span>
                         <span>{isRendering ? 'RENDERING' : 'PREVIEW'}</span>
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
