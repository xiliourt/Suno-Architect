
import React, { useState, useEffect, useRef } from 'react';
import { SunoClip, AlignedWord } from '../types';
import { getLyricAlignment, getSunoClip } from '../services/sunoApi';
import { groupLyricsByLines, matchWordsToPrompt, groupWordsByTiming, stripMetaTags, getCleanAlignedWords } from '../services/geminiService';
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

const AUDIO_BITRATES = [
    { label: "128 kbps (Standard)", value: 128000 },
    { label: "192 kbps (High)", value: 192000 },
    { label: "256 kbps (Very High)", value: 256000 },
    { label: "320 kbps (Master)", value: 320000 },
];

const FONTS = [
    { label: "Inter (Modern Sans)", value: "Inter, sans-serif" },
    { label: "Montserrat (Geometric)", value: "Montserrat, sans-serif" },
    { label: "Roboto (Neutral)", value: "Roboto, sans-serif" },
    { label: "Lora (Serif)", value: "Lora, serif" },
    { label: "Courier Prime (Mono)", value: "'Courier Prime', monospace" },
];

type Qt6Style = 'wave' | 'bars' | 'circle';

const VisualizerSection: React.FC<VisualizerSectionProps> = ({ history, sunoCookie, onUpdateClip, apiKey, geminiModel }) => {
  // Selection State
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [manualId, setManualId] = useState('');
  
  // Visual Settings
  const [aspectRatio, setAspectRatio] = useState<keyof typeof ASPECT_RATIOS>("16:9");
  const [visualMode, setVisualMode] = useState<'cover' | 'qt6'>('cover');
  const [customBg, setCustomBg] = useState<{ url: string, type: 'image' | 'video', name: string } | null>(null);
  const [customAudio, setCustomAudio] = useState<{ url: string, name: string } | null>(null);
  const [audioBitrate, setAudioBitrate] = useState(192000);
  const [imgSrc, setImgSrc] = useState<string>('');

  // Style Customization State
  const [activeColor, setActiveColor] = useState('#e879f9');
  const [inactiveColor, setInactiveColor] = useState('#ffffff');
  const [inactiveOpacity, setInactiveOpacity] = useState(0.3);
  const [fontFamily, setFontFamily] = useState('Inter, sans-serif');
  const [smoothingFactor, setSmoothingFactor] = useState(0.1); 
  const [verticalOffset, setVerticalOffset] = useState(0); 

  // Qt6 Specific Settings
  const [qt6Style, setQt6Style] = useState<Qt6Style>('wave');
  const [qt6BarCount, setQt6BarCount] = useState(64);
  const [qt6Sensitivity, setQt6Sensitivity] = useState(1.0);

  // Data State
  const [clipData, setClipData] = useState<SunoClip | null>(null);
  const [alignment, setAlignment] = useState<AlignedWord[] | null>(null);
  const [lines, setLines] = useState<AlignedWord[][]>([]);
  const [lyricSource, setLyricSource] = useState(''); 
  const [applyStatus, setApplyStatus] = useState<'idle' | 'applied'>('idle');
  
  // Audio/Canvas/Media References
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const customVideoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Audio Context & Analysis Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Smoothing Refs
  const smoothLineIdxRef = useRef(0);
  
  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Setup Audio Analysis for Qt6 Visualizer
  useEffect(() => {
    if (visualMode === 'qt6' && audioRef.current && !sourceNodeRef.current) {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;

            const ctx = new AudioContextClass();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048; // Standard size
            analyser.smoothingTimeConstant = 0.8;
            
            const source = ctx.createMediaElementSource(audioRef.current);
            source.connect(analyser);
            analyser.connect(ctx.destination);
            
            audioContextRef.current = ctx;
            analyserRef.current = analyser;
            sourceNodeRef.current = source;
            // Buffer size depends on mode, but 2048 covers both time and freq bins (1024)
            dataArrayRef.current = new Uint8Array(analyser.fftSize);
        } catch (e) {
            console.error("Audio Context Init Failed:", e);
        }
    }
  }, [visualMode]);

  // Handle Image Source Logic
  useEffect(() => {
    if (!clipData) return;
    let url = clipData.imageLargeUrl || clipData.imageUrl || `https://cdn2.suno.ai/image_large_${clipData.id}.jpeg`;
    if (url.includes('suno.ai') && !url.includes('?')) {
        url += `?t=${Date.now()}`;
    }
    setImgSrc(url);
    if (!lyricSource) {
        const raw = clipData.metadata?.prompt || clipData.originalData?.lyricsAlone || "";
        setLyricSource(raw);
    }
  }, [clipData]);

  const handleImageError = () => {
      setImgSrc('https://placehold.co/1080x1080/1e293b/475569?text=No+Cover');
  };

  // Load Clip Data
  useEffect(() => {
    if (!selectedClipId) return;
    setLines([]); 
    setApplyStatus('idle');
    setCustomAudio(null);

    const loadData = async () => {
        let currentClip = history.find(c => c.id === selectedClipId);
        let fetchedData: any = null;

        if (sunoCookie && !selectedClipId.startsWith('draft_')) {
             try {
                 setIsPreparing(true);
                 fetchedData = await getSunoClip(selectedClipId, sunoCookie);
             } catch (e) {
                 console.warn("Could not fetch clip details, using local/fallback", e);
             }
        }

        if (fetchedData) {
            const meta = fetchedData.metadata || {};
            const prompt = meta.prompt || "";
            const tags = meta.tags || "";
            
            currentClip = {
                id: fetchedData.id,
                title: fetchedData.title || (currentClip?.title || 'Untitled'),
                created_at: fetchedData.created_at || new Date().toISOString(),
                model_name: fetchedData.model_name || 'Unknown',
                imageUrl: fetchedData.image_url || fetchedData.image_large_url,
                imageLargeUrl: fetchedData.image_large_url,
                metadata: { tags: tags, prompt: prompt },
                originalData: currentClip?.originalData || {
                    style: tags, title: fetchedData.title || '', excludeStyles: '', advancedParams: '', vocalGender: '', weirdness: 50, styleInfluence: 50, lyricsWithTags: prompt, lyricsAlone: prompt.replace(/\[[\s\S]*?\]/g, "").trim(), javascriptCode: '', fullResponse: ''
                },
                alignmentData: currentClip?.alignmentData 
            };
        } else if (!currentClip) {
             currentClip = {
                id: selectedClipId,
                title: '', 
                created_at: new Date().toISOString(),
                model_name: 'Unknown',
                imageUrl: `https://cdn2.suno.ai/image_large_${selectedClipId}.jpeg`,
                metadata: { tags: '', prompt: '' }
            };
        }
        
        setClipData(currentClip);

        let sourceText = currentClip.metadata?.prompt || "";
        if (!sourceText && currentClip.originalData?.lyricsAlone) {
            sourceText = currentClip.originalData.lyricsAlone;
        }
        setLyricSource(sourceText);

        let align = currentClip.alignmentData;
        if (!align && sunoCookie && !currentClip.id.startsWith('draft_')) {
             try {
                 setIsPreparing(true);
                 const res = await getLyricAlignment(currentClip.id, sunoCookie);
                 if (res && res.aligned_words) {
                     align = res.aligned_words;
                     if (history.some(h => h.id === currentClip.id)) {
                        onUpdateClip(currentClip.id, { alignmentData: align });
                     }
                 }
             } catch (e) {
                 console.error("Alignment fetch failed", e);
             }
        }
        setAlignment(align || null);

        if (align) {
             let autoLines;
             if (sourceText) {
                 autoLines = matchWordsToPrompt(align, sourceText);
             } else {
                 autoLines = groupWordsByTiming(align);
             }
             setLines(autoLines);
        }

        setIsPreparing(false);
    };

    loadData();
  }, [selectedClipId, history, sunoCookie, onUpdateClip]);

  const handleManualLoad = () => {
      if (manualId.trim()) setSelectedClipId(manualId.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const url = URL.createObjectURL(file);
        let type: 'video' | 'image' = 'image';
        if (file.type.startsWith('video') || file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
            type = 'video';
        }
        setCustomBg({ url, type, name: file.name });
        setVisualMode('cover'); 
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const url = URL.createObjectURL(file);
        setCustomAudio({ url, name: file.name });
        if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    }
  };

  const handleApplyLyrics = () => {
    if(!alignment) return;
    const newLines = matchWordsToPrompt(alignment, lyricSource);
    setLines(newLines);
    setApplyStatus('applied');
    setTimeout(() => setApplyStatus('idle'), 2000);
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
          const pseudoLines = matchWordsToPrompt(alignment, lyricSource);
          setLines(pseudoLines);
          const grouped = await groupLyricsByLines(cleanLyrics, cleanAligned, apiKey, geminiModel, pseudoLines);
          if (grouped && grouped.length > 0) {
              setLines(grouped);
          }
      } catch (e) {
          console.error(e);
          alert("Failed to group lines with AI. Kept prompt-based grouping.");
      } finally {
          setIsGrouping(false);
      }
  };

  const formatTime = (seconds: number) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      if (audioRef.current) {
          audioRef.current.currentTime = time;
          setProgress(time);
      }
  };

  const togglePlay = () => {
      if (audioRef.current) {
          if (audioRef.current.paused) {
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                  audioContextRef.current.resume();
              }
              audioRef.current.play();
              setIsPlaying(true);
          } else {
              audioRef.current.pause();
              setIsPlaying(false);
          }
      }
  };

  const hexToRgba = (hex: string, alpha: number) => {
    let c: any;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3) c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255,255,255,${alpha})`;
  }

  const drawCover = (ctx: CanvasRenderingContext2D, img: CanvasImageSource | HTMLVideoElement | HTMLImageElement, w: number, h: number) => {
        let imgW = 0; let imgH = 0;
        if (img instanceof HTMLVideoElement) { imgW = img.videoWidth; imgH = img.videoHeight; } 
        else if (img instanceof HTMLImageElement) { imgW = img.naturalWidth || img.width; imgH = img.naturalHeight || img.height; }
        if (!imgW || !imgH) return;
        const imgRatio = imgW / imgH; const winRatio = w / h;
        let drawW, drawH, startX, startY;
        if (imgRatio > winRatio) { drawH = h; drawW = h * imgRatio; startX = (w - drawW) / 2; startY = 0; } 
        else { drawW = w; drawH = w / imgRatio; startX = 0; startY = (h - drawH) / 2; }
        ctx.drawImage(img, startX, startY, drawW, drawH);
  };

  const drawQt6Visualizer = (ctx: CanvasRenderingContext2D, width: number, height: number, data: Uint8Array | Float32Array, type: Qt6Style) => {
        ctx.lineWidth = 2;
        ctx.strokeStyle = activeColor;
        ctx.fillStyle = activeColor;
        ctx.beginPath();

        const bufferLength = data.length;
        const isFloat = data instanceof Float32Array;

        // Waveform Logic (Time Domain)
        if (type === 'wave') {
            const sliceWidth = width / bufferLength;
            let x = 0;
            const baseline = height * 0.85;
            const scale = height * 0.15 * qt6Sensitivity;

            for (let i = 0; i < bufferLength; i++) {
                let v = 0;
                if (isFloat) v = data[i] as number;
                else v = ((data[i] as number) - 128) / 128.0;
                
                const y = baseline + (v * scale);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.stroke();
        } 
        // Bars Logic (Frequency Domain)
        else if (type === 'bars') {
            const barCount = qt6BarCount;
            // Trim high-end static noise. Typically 0-24kHz. 
            // Music energy mostly < 12kHz.
            // Ignore DC (index 0-2).
            const startBin = 2;
            const usefulLimit = Math.min(bufferLength, Math.floor(bufferLength * 0.6));
            const range = usefulLimit - startBin;
            const step = Math.max(1, Math.floor(range / barCount));
            
            const barWidth = (width / barCount) * 0.8;
            const gap = (width / barCount) * 0.2;
            
            for(let i = 0; i < barCount; i++) {
                let sum = 0;
                let count = 0;
                for(let j = 0; j < step; j++) {
                    const idx = startBin + i * step + j;
                    if(idx < usefulLimit) {
                        sum += (data[idx] as number);
                        count++;
                    }
                }
                const avg = count > 0 ? sum / count : 0;
                const val = (avg / 255.0) * qt6Sensitivity;
                // Add minimum height to avoid flicker on silence
                const barHeight = Math.max(2, val * (height * 0.5));
                
                const x = i * (barWidth + gap) + (gap / 2);
                const y = height * 0.95 - barHeight;
                
                ctx.beginPath();
                if (ctx.roundRect) {
                     ctx.roundRect(x, y, barWidth, barHeight, 4);
                } else {
                     ctx.rect(x, y, barWidth, barHeight);
                }
                ctx.fill();
            }
        }
        // Circle Logic (Frequency Domain)
        else if (type === 'circle') {
            const centerX = width / 2;
            const centerY = height / 2;
            // Base radius + modulation
            const baseRadius = Math.min(width, height) * 0.20;
            const maxExtrude = Math.min(width, height) * 0.25;
            
            // Calculate bass energy for pulsing inner circle
            let bassSum = 0;
            for(let k=2; k<12; k++) bassSum += (data[k] as number);
            const bassEnergy = (bassSum / 10 / 255.0) * qt6Sensitivity;
            const currentRadius = baseRadius + (bassEnergy * 20);

            // Mirror Spectrum: Lows at top, Highs at bottom
            // Use 64 total bars (32 per side)
            const totalBars = 64; 
            const halfBars = totalBars / 2;
            
            // Limit to useful frequency range (~50% of bins)
            const startBin = 2;
            const usefulLimit = Math.floor(bufferLength * 0.5);
            const step = Math.floor((usefulLimit - startBin) / halfBars);

            ctx.lineCap = 'round';
            ctx.lineWidth = 4;

            for(let i = 0; i < halfBars; i++) {
                let sum = 0;
                for(let j=0; j<step; j++) {
                     const idx = startBin + i*step + j;
                     if(idx < usefulLimit) sum += (data[idx] as number);
                }
                const avg = sum/step;
                const val = (avg / 255.0) * qt6Sensitivity;
                
                // Quadratic curve for punchier visuals
                const barH = Math.max(4, Math.pow(val, 2) * maxExtrude);

                // Angle step
                const angleStep = Math.PI / halfBars;
                const angleOffset = i * angleStep;

                // Right Side (Top to Bottom)
                // -PI/2 is top. 
                const angleR = -Math.PI/2 + angleOffset;
                
                // Left Side (Top to Bottom)
                const angleL = -Math.PI/2 - angleOffset;

                drawRadialBar(ctx, centerX, centerY, currentRadius, barH, angleR);
                // Don't double draw top/bottom center perfectly to avoid artifacts, or do it for symmetry
                if (i > 0) {
                    drawRadialBar(ctx, centerX, centerY, currentRadius, barH, angleL);
                }
            }
            
            // Inner Glow Circle
            ctx.beginPath();
            ctx.arc(centerX, centerY, currentRadius - 5, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(activeColor, 0.1 + (bassEnergy * 0.2));
            ctx.fill();
            ctx.strokeStyle = hexToRgba(activeColor, 0.5);
            ctx.lineWidth = 2;
            ctx.stroke();
        }
  };

  const drawRadialBar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, h: number, angle: number) => {
        const x1 = cx + Math.cos(angle) * r;
        const y1 = cy + Math.sin(angle) * r;
        const x2 = cx + Math.cos(angle) * (r + h);
        const y2 = cy + Math.sin(angle) * (r + h);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
  };

  // --- DRAWING LOGIC ---
  const renderFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number, data?: Uint8Array | Float32Array, isFrequencyData: boolean = false) => {
      // 1. Background Layer
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      if (visualMode === 'cover') {
          let drawn = false;
          if (customBg) {
              if (customBg.type === 'video' && customVideoRef.current) {
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
          if (!drawn) {
            const bgImg = document.getElementById('source-img') as HTMLImageElement;
            if (bgImg && bgImg.complete) {
                drawCover(ctx, bgImg, width, height);
            }
          }
          // Overlay Dimmer
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(0, 0, width, height);
      } else if (visualMode === 'qt6') {
          // Qt6 Visualizer Background (Dark Gradient)
          const grad = ctx.createLinearGradient(0, 0, 0, height);
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);

          // Render Visualizer
          if (data) {
              drawQt6Visualizer(ctx, width, height, data, qt6Style);
          } else if (analyserRef.current && dataArrayRef.current) {
              // Realtime extraction
              if (qt6Style === 'wave') {
                  analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
                  drawQt6Visualizer(ctx, width, height, dataArrayRef.current, 'wave');
              } else {
                  analyserRef.current.getByteFrequencyData(dataArrayRef.current);
                  drawQt6Visualizer(ctx, width, height, dataArrayRef.current, qt6Style);
              }
          }
      }

      // 2. Draw Text (Smooth Scroll)
      if (lines.length > 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
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
          
          if (activeLineIdx !== -1) {
              const diff = activeLineIdx - smoothLineIdxRef.current;
              if (Math.abs(diff) > 4) {
                  smoothLineIdxRef.current = activeLineIdx;
              } else {
                  const factor = smoothingFactor;
                  smoothLineIdxRef.current += diff * factor;
              }
          }

          const renderCenterIdx = smoothLineIdxRef.current;
          const baseIdx = Math.floor(renderCenterIdx);
          const PADDING = aspectRatio === "9:16" ? 60 : 40;
          const centerY = (height / 2) + (height * verticalOffset);

          const getLayout = (idx: number, scale: number) => {
              if (idx < 0 || idx >= lines.length) return null;
              const line = lines[idx];
              if (line.length === 0) return null;

              let fontSize = 48 * scale;
              if (aspectRatio === "9:16") fontSize = 36 * scale; 
              
              ctx.font = `bold ${fontSize}px ${fontFamily}`;
              const lineHeight = fontSize * 1.3;
              const maxW = width * 0.85;

              const wordsWithWidths = line.map(w => ({
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
              return { rows, totalHeight: rows.length * lineHeight, lineHeight, fontSize };
          };

          const visibleLines = [];
          for (let i = baseIdx - 2; i <= baseIdx + 3; i++) {
              if (i >= 0 && i < lines.length) {
                  const dist = Math.abs(i - renderCenterIdx);
                  const scale = Math.max(0.6, 1.2 - (dist * 0.3)); 
                  const opacity = Math.max(0.1, 1 - (dist * 0.5));
                  
                  const layout = getLayout(i, scale);
                  if (layout) {
                      visibleLines.push({ index: i, layout, scale, opacity });
                  }
              }
          }

          const fractional = renderCenterIdx - baseIdx;
          const baseLayoutRef = getLayout(baseIdx, 1.0); 
          const nextLayoutRef = getLayout(baseIdx + 1, 1.0);
          
          const baseH = baseLayoutRef ? baseLayoutRef.totalHeight : 60;
          const nextH = nextLayoutRef ? nextLayoutRef.totalHeight : 60;
          
          const scrollDist = (baseH / 2) + PADDING + (nextH / 2);
          const pixelOffset = fractional * scrollDist;

          visibleLines.forEach(item => {
              const relIndex = item.index - baseIdx; 
              let yOffset = 0;
              
              if (relIndex === 0) {
                  yOffset = 0;
              } else if (relIndex > 0) {
                  let hSum = baseH / 2 + PADDING; 
                  for (let k = baseIdx + 1; k < item.index; k++) {
                       const l = getLayout(k, 1.0);
                       hSum += (l ? l.totalHeight : 60) + PADDING;
                  }
                  const l = getLayout(item.index, 1.0);
                  hSum += (l ? l.totalHeight : 60) / 2;
                  yOffset = hSum;
              } else {
                  let hSum = baseH / 2 + PADDING;
                  for (let k = baseIdx - 1; k > item.index; k--) {
                      const l = getLayout(k, 1.0);
                      hSum += (l ? l.totalHeight : 60) + PADDING;
                  }
                  const l = getLayout(item.index, 1.0);
                  hSum += (l ? l.totalHeight : 60) / 2;
                  yOffset = -hSum;
              }

              const drawY = centerY - pixelOffset + yOffset;
              
              ctx.font = `bold ${item.layout.fontSize}px ${fontFamily}`;
              const startTextY = drawY - ((item.layout.rows.length - 1) * item.layout.lineHeight) / 2;

              item.layout.rows.forEach((row: any, rowIdx: number) => {
                  const rowY = startTextY + (rowIdx * item.layout.lineHeight);
                  let currentX = (width - row.width) / 2;

                  row.words.forEach((w: any) => {
                      const isWordActive = time >= w.start_s && time <= w.end_s;
                      const isWordPast = time > w.end_s;
                      const isLineActive = item.index === activeLineIdx;

                      if (isLineActive) {
                         if (isWordActive) {
                             ctx.fillStyle = activeColor;
                             ctx.shadowColor = activeColor; 
                             ctx.shadowBlur = 25;
                         } else if (isWordPast) {
                             ctx.fillStyle = hexToRgba(inactiveColor, 0.9);
                             ctx.shadowBlur = 0;
                         } else {
                             ctx.fillStyle = hexToRgba(inactiveColor, inactiveOpacity);
                             ctx.shadowBlur = 0;
                         }
                      } else {
                          ctx.fillStyle = hexToRgba(inactiveColor, item.opacity * inactiveOpacity);
                          ctx.shadowBlur = 0;
                      }

                      ctx.textAlign = 'left';
                      ctx.fillText(w.word, currentX, rowY);
                      currentX += w.width;
                  });
              });
              ctx.shadowBlur = 0;
          });

      }

      // Title & Progress Bar
      ctx.textAlign = 'center';
      ctx.font = `bold 24px ${fontFamily}`;
      ctx.fillStyle = '#ffffff';
      
      const titleY = aspectRatio === "9:16" ? 120 : 60;
      if (clipData?.title) {
          ctx.fillText(clipData.title, width / 2, titleY);
      }

      if (clipData && duration) {
          const pct = time / duration;
          ctx.fillStyle = activeColor;
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
  }, [selectedClipId, alignment, lines, isRendering, aspectRatio, visualMode, customBg, activeColor, inactiveColor, fontFamily, smoothingFactor, inactiveOpacity, verticalOffset, qt6Style, qt6BarCount, qt6Sensitivity]);

  // --- OFFLINE RENDERING LOGIC ---
  const startOfflineRender = async () => {
    if (!clipData || !audioRef.current || !canvasRef.current) return;
    
    audioRef.current.pause();
    if(customVideoRef.current) customVideoRef.current.pause();

    setIsRendering(true);
    setRenderProgress(0);

    const originalSmoothRef = smoothLineIdxRef.current;
    smoothLineIdxRef.current = 0; 

    let fileHandle: any = null;
    let writableStream: any = null;

    try {
        // 1. Fetch & Decode Audio
        const audioSrc = audioRef.current.src;
        const response = await fetch(audioSrc);
        const arrayBuffer = await response.arrayBuffer();

        // FIX: Decode audio first to get length and sample rate
        const audioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const tempCtx = new audioContextClass();
        const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
        
        // We use OfflineAudioContext for extracting analysis data frame-by-frame
        const offlineCtx = new OfflineAudioContext(2, decodedBuffer.length, decodedBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;
        
        // Setup Analysis for Offline
        const analyser = offlineCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyser.connect(offlineCtx.destination);
        source.start(0);

        const duration = source.buffer.duration;
        const { width: targetWidth, height: targetHeight } = ASPECT_RATIOS[aspectRatio];
        const filename = `${(clipData.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${aspectRatio.replace(':','-')}.webm`;
        
        // Setup Muxer & Encoders
        let muxerTarget: any;
        if ('showSaveFilePicker' in window) {
            try {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'WebM Video', accept: { 'video/webm': ['.webm'] } }],
                });
                writableStream = await fileHandle.createWritable();
                muxerTarget = new FileSystemWritableFileStreamTarget(writableStream);
            } catch (err: any) {
                if (err.name === 'AbortError') { setIsRendering(false); smoothLineIdxRef.current = originalSmoothRef; return; }
                console.warn("File System Access failed, falling back to RAM.", err);
            }
        }
        if (!muxerTarget) muxerTarget = new ArrayBufferTarget();

        const muxer = new Muxer({
            target: muxerTarget,
            video: { codec: 'V_VP9', width: targetWidth, height: targetHeight },
            audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 }
        });

        // @ts-ignore
        const videoEncoder = new VideoEncoder({
            output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
            error: (e: any) => console.error("Video Encoder error", e)
        });
        videoEncoder.configure({
            codec: 'vp09.00.10.08', width: targetWidth, height: targetHeight, bitrate: 8_000_000, framerate: 60
        });

        // @ts-ignore
        const audioEncoder = new AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (e: any) => console.error("Audio Encoder error", e)
        });
        audioEncoder.configure({ codec: 'opus', numberOfChannels: 2, sampleRate: 48000, bitrate: audioBitrate });

        const fps = 60;
        const totalFrames = Math.ceil(duration * fps);
        const ctx = canvasRef.current.getContext('2d')!;
        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;

        let frameIndex = 0;
        const processFrame = async () => {
            const t = frameIndex / fps;
            
            // Sync custom video background if needed
            if (visualMode === 'cover' && customBg?.type === 'video' && customVideoRef.current) {
                const vid = customVideoRef.current;
                const loopTime = t % vid.duration;
                // Basic seek emulation
                vid.currentTime = loopTime; 
                // We rely on browser having frame available; might be glitchy without drawing to temp canvas
            }

            // Extract Data
            const freqData = new Uint8Array(analyser.frequencyBinCount);
            if (qt6Style === 'wave') {
                analyser.getByteTimeDomainData(freqData);
            } else {
                analyser.getByteFrequencyData(freqData);
            }

            renderFrame(ctx, targetWidth, targetHeight, t, freqData);
            
            // @ts-ignore
            const frame = new VideoFrame(canvasRef.current, { timestamp: t * 1000000 });
            videoEncoder.encode(frame, { keyFrame: frameIndex % (fps * 2) === 0 });
            frame.close();

            if (videoEncoder.encodeQueueSize > 5) {
                await videoEncoder.flush();
            }

            frameIndex++;
            setRenderProgress((frameIndex / totalFrames) * 100);
            
            if (frameIndex < totalFrames) {
                offlineCtx.suspend((frameIndex) / fps).then(processFrame).then(() => offlineCtx.resume());
            } else {
                offlineCtx.resume(); // Finish up
            }
        };

        // Trigger first frame at 0
        offlineCtx.suspend(0).then(processFrame).then(() => offlineCtx.resume());
        
        // Start Processing
        await offlineCtx.startRendering();

        // Encode Audio Track (Manual extraction from buffer since we need 48k for muxer)
        const sourceBuffer = decodedBuffer;
        const numberOfChannels = 2;
        const audioDataLength = sourceBuffer.length;
        const sourceSampleRate = sourceBuffer.sampleRate;
        const chunkFrames = 48000;
        
        for (let offset = 0; offset < audioDataLength; offset += chunkFrames) {
            const end = Math.min(offset + chunkFrames, audioDataLength);
            const frames = end - offset;
            const data = new Float32Array(frames * numberOfChannels);
            for (let ch = 0; ch < numberOfChannels; ch++) {
                const srcData = sourceBuffer.getChannelData(ch < sourceBuffer.numberOfChannels ? ch : 0);
                data.set(srcData.subarray(offset, end), ch * frames);
            }
            // @ts-ignore
            const audioData = new AudioData({
                format: 'f32-planar', sampleRate: sourceSampleRate, numberOfFrames: frames, numberOfChannels: numberOfChannels, timestamp: (offset / sourceSampleRate) * 1000000, data: data
            });
            audioEncoder.encode(audioData);
            audioData.close();
        }

        await videoEncoder.flush();
        await audioEncoder.flush();
        muxer.finalize();

        if (writableStream) { await writableStream.close(); } 
        else {
            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        }

    } catch (e) {
        console.error("Offline render failed", e);
        alert("Render failed. Check console.");
    } finally {
        setIsRendering(false);
        setRenderProgress(0);
        smoothLineIdxRef.current = originalSmoothRef;
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
                                className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 font-bold border
                                    ${applyStatus === 'applied' 
                                        ? 'bg-green-600 border-green-500 text-white' 
                                        : 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white'}`}
                                title="Update lines based on this text"
                            >
                                {applyStatus === 'applied' ? 'Applied!' : 'Apply Structure'}
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

                     {/* Media & Composition Card */}
                     <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-lg p-4 space-y-4">
                         {/* Cover Art / Visualizer Preview */}
                         <div className="relative group rounded-lg overflow-hidden border border-slate-700/50">
                             {visualMode === 'cover' ? (
                                <>
                                    <img 
                                        id="source-img"
                                        src={imgSrc} 
                                        alt="Cover" 
                                        crossOrigin="anonymous" 
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
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </>
                             ) : (
                                <div className="w-full h-32 bg-gradient-to-b from-slate-800 to-black flex flex-col items-center justify-center border-b border-slate-700 gap-2">
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Qt6 Style: {qt6Style}</span>
                                    <div className="flex gap-2">
                                        <div className={`w-2 h-6 rounded-full ${qt6Style === 'wave' ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                        <div className={`w-2 h-6 rounded-full ${qt6Style === 'bars' ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                        <div className={`w-2 h-6 rounded-full ${qt6Style === 'circle' ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                    </div>
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

                                 {/* Visual Mode Selector */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Background Mode</label>
                                     <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                                         <button 
                                            onClick={() => setVisualMode('cover')}
                                            className={`flex-1 text-[10px] font-bold py-1.5 rounded transition-colors ${visualMode === 'cover' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                                         >
                                             Cover / Custom
                                         </button>
                                         <button 
                                            onClick={() => setVisualMode('qt6')}
                                            className={`flex-1 text-[10px] font-bold py-1.5 rounded transition-colors ${visualMode === 'qt6' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                                         >
                                             Qt6 Visualizer
                                         </button>
                                     </div>
                                 </div>

                                 {/* Background File Upload */}
                                 {visualMode === 'cover' && (
                                     <div>
                                         <label className="text-xs text-slate-500 block mb-1">Custom Media</label>
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
                                 )}

                                 {/* Audio File Upload */}
                                 <div>
                                     <label className="text-xs text-slate-500 block mb-1">Audio Source (Override)</label>
                                     {customAudio ? (
                                         <div className="flex items-center justify-between bg-slate-900 border border-green-500/30 rounded p-2">
                                             <div className="flex items-center gap-2 overflow-hidden">
                                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-400 flex-shrink-0">
                                                     <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                                                 </svg>
                                                 <span className="text-xs text-green-300 truncate" title={customAudio.name}>{customAudio.name}</span>
                                             </div>
                                             <button onClick={() => setCustomAudio(null)} className="text-slate-500 hover:text-white">
                                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                     <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                 </svg>
                                             </button>
                                         </div>
                                     ) : (
                                        <label className="flex items-center justify-center w-full px-2 py-2 border border-dashed border-slate-600 rounded cursor-pointer hover:bg-slate-800 transition-colors group bg-slate-900/50">
                                            <input 
                                                type="file" 
                                                accept="audio/*" 
                                                className="hidden" 
                                                onChange={handleAudioUpload}
                                            />
                                            <div className="flex items-center gap-2 text-slate-400 group-hover:text-white">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                                                    <path d="M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
                                                </svg>
                                                <span className="text-xs">Upload Mastered File</span>
                                            </div>
                                        </label>
                                     )}
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
                            src={customAudio ? customAudio.url : `https://cdn1.suno.ai/${selectedClipId}.mp3`}
                            crossOrigin="anonymous" // CRITICAL FOR RECORDING
                            className="w-full h-8"
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                         />
                     </div>

                     {/* Action Button & Bitrate */}
                     <div className="space-y-2">
                         <div className="flex items-center justify-between">
                             <label className="text-xs text-slate-500">Audio Quality</label>
                             <select 
                                value={audioBitrate}
                                onChange={(e) => setAudioBitrate(Number(e.target.value))}
                                className="bg-slate-900 border border-slate-700 rounded text-xs text-white p-1 focus:ring-1 focus:ring-purple-500"
                             >
                                 {AUDIO_BITRATES.map(b => (
                                     <option key={b.value} value={b.value}>{b.label}</option>
                                 ))}
                             </select>
                         </div>
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
                     </div>
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
                     {/* ... Controls Panel ... */}
                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                         {/* ... same as before ... */}
                         <div className="flex items-center justify-between mb-3">
                             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Visual Settings</h3>
                             <button onClick={() => {
                                 setActiveColor('#e879f9');
                                 setInactiveColor('#ffffff');
                                 setInactiveOpacity(0.3);
                                 setFontFamily('Inter, sans-serif');
                                 setSmoothingFactor(0.1);
                                 setVerticalOffset(0);
                                 setQt6Style('wave');
                                 setQt6BarCount(64);
                                 setQt6Sensitivity(1.0);
                             }} className="text-xs text-purple-400 hover:text-purple-300">Reset to Default</button>
                         </div>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             {/* ... same inputs ... */}
                             <div className="col-span-2 md:col-span-1">
                                 <label className="text-[10px] text-slate-500 block mb-1">Font Family</label>
                                 <select 
                                    value={fontFamily} 
                                    onChange={(e) => setFontFamily(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
                                 >
                                     {FONTS.map(f => (
                                         <option key={f.value} value={f.value}>{f.label}</option>
                                     ))}
                                 </select>
                             </div>
                             <div>
                                 <label className="text-[10px] text-slate-500 block mb-1">Active Color</label>
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="color" 
                                        value={activeColor}
                                        onChange={(e) => setActiveColor(e.target.value)}
                                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0" 
                                     />
                                     <span className="text-xs font-mono text-slate-400">{activeColor}</span>
                                 </div>
                             </div>
                             <div>
                                 <label className="text-[10px] text-slate-500 block mb-1">Inactive Color</label>
                                 <div className="flex items-center gap-2">
                                     <input 
                                        type="color" 
                                        value={inactiveColor}
                                        onChange={(e) => setInactiveColor(e.target.value)}
                                        className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0" 
                                     />
                                     <span className="text-xs font-mono text-slate-400">{inactiveColor}</span>
                                 </div>
                             </div>
                             <div className="col-span-2 md:col-span-1">
                                 <label className="text-[10px] text-slate-500 block mb-1">Scroll Smoothing</label>
                                 <input 
                                    type="range" 
                                    min="0.01" 
                                    max="0.5" 
                                    step="0.01" 
                                    value={smoothingFactor} 
                                    onChange={(e) => setSmoothingFactor(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                 />
                                 <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                     <span>Smooth</span>
                                     <span>Instant</span>
                                 </div>
                             </div>
                             <div className="col-span-2 md:col-span-1">
                                 <label className="text-[10px] text-slate-500 block mb-1">Vertical Position</label>
                                 <input 
                                    type="range" 
                                    min="-0.4" 
                                    max="0.4" 
                                    step="0.01" 
                                    value={verticalOffset} 
                                    onChange={(e) => setVerticalOffset(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                 />
                                 <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                     <span>Top</span>
                                     <span>Bottom</span>
                                 </div>
                             </div>
                         </div>
                     </div>

                     {/* Qt6 Specific Controls (Visible if mode is Qt6) */}
                     {visualMode === 'qt6' && (
                         <div className="bg-slate-900 border border-purple-500/20 rounded-xl p-4 animate-in fade-in">
                             <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">Qt6 Visualizer Controls</h3>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 <div>
                                     <label className="text-[10px] text-slate-500 block mb-1">Type</label>
                                     <select 
                                        value={qt6Style}
                                        onChange={(e) => setQt6Style(e.target.value as Qt6Style)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white focus:ring-1 focus:ring-purple-500"
                                     >
                                         <option value="wave">Oscilloscope (Wave)</option>
                                         <option value="bars">Stylish Bars</option>
                                         <option value="circle">Expanding Circle</option>
                                     </select>
                                 </div>
                                 {qt6Style === 'bars' && (
                                     <div>
                                         <label className="text-[10px] text-slate-500 block mb-1">Bar Count</label>
                                         <select 
                                            value={qt6BarCount}
                                            onChange={(e) => setQt6BarCount(Number(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-xs text-white"
                                         >
                                             <option value="32">32 Bars (Chunky)</option>
                                             <option value="64">64 Bars (Standard)</option>
                                             <option value="128">128 Bars (Detailed)</option>
                                         </select>
                                     </div>
                                 )}
                                 <div>
                                     <label className="text-[10px] text-slate-500 block mb-1">Sensitivity (Gain)</label>
                                     <input 
                                        type="range" 
                                        min="0.5" 
                                        max="3.0" 
                                        step="0.1" 
                                        value={qt6Sensitivity}
                                        onChange={(e) => setQt6Sensitivity(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                     />
                                 </div>
                             </div>
                         </div>
                     )}

                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                         <div className="relative group">
                             <input 
                                type="range" 
                                min={0} 
                                max={duration || 100}
                                value={progress}
                                onChange={handleSeek}
                                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                style={{
                                    background: `linear-gradient(to right, #a855f7 ${(progress / (duration || 1)) * 100}%, #1e293b ${(progress / (duration || 1)) * 100}%)`
                                }}
                             />
                         </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-4">
                                 <button 
                                     onClick={togglePlay}
                                     className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:bg-purple-400 transition-colors"
                                 >
                                     {isPlaying ? (
                                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                                         </svg>
                                     ) : (
                                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                         </svg>
                                     )}
                                 </button>
                                 <div className="text-xs font-mono text-slate-400">
                                     <span className="text-white">{formatTime(progress)}</span> / {formatTime(duration)}
                                 </div>
                             </div>
                             <div className="text-xs text-slate-600 font-mono hidden sm:block">
                                 {ASPECT_RATIOS[aspectRatio].label} • {isRendering ? 'RENDERING' : 'PREVIEW'}
                             </div>
                         </div>
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
