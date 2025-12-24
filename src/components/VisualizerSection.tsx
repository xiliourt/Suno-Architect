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
}

const VisualizerSection: React.FC<VisualizerSectionProps> = ({ history, sunoCookie, onUpdateClip, apiKey }) => {
  // Selection State
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [manualId, setManualId] = useState('');
  
  // Data State
  const [clipData, setClipData] = useState<SunoClip | null>(null);
  const [alignment, setAlignment] = useState<AlignedWord[] | null>(null);
  const [lines, setLines] = useState<AlignedWord[][]>([]);
  
  // Audio/Canvas References
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
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
   */
  const stripMetaTags = (text: string): string => {
      if (!text) return "";
      return text
          .replace(/\[.*?\]/g, '') // Remove [Verse], [Chorus]
          .replace(/\(.*?\)/g, '') // Remove (Ad-libs)
          .replace(/\{.*?\}/g, '') // Remove {Tags}
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
  };

  /**
   * Robust grouping based on timing gaps and character count.
   * This ensures the visualizer paces with the audio gaps, rather than getting desynced by text mismatch.
   */
  const groupWordsByTiming = (aligned: AlignedWord[]): AlignedWord[][] => {
      const cleanAligned = aligned.filter(w => !isMetaWord(w.word));
      if (cleanAligned.length === 0) return [];

      const groups: AlignedWord[][] = [];
      let currentLine: AlignedWord[] = [];
      
      const GAP_THRESHOLD = 0.65; // Seconds of silence to trigger new line
      const MAX_CHARS = 45;       // Max characters per line before soft-wrap

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
            title: 'Suno Track',
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

  const handleSmartGroup = async () => {
      if (!clipData || !alignment) return;
      
      const rawLyrics = clipData.originalData?.lyricsAlone || clipData.metadata?.prompt || "";
      const cleanLyrics = stripMetaTags(rawLyrics);

      if (!cleanLyrics) {
          alert("No text lyrics found to group against.");
          return;
      }
      
      setIsGrouping(true);
      try {
          const cleanAligned = alignment.filter(w => !isMetaWord(w.word));
          const grouped = await groupLyricsByLines(cleanLyrics, cleanAligned, apiKey);
          if (grouped && grouped.length > 0) {
              setLines(grouped);
          } else {
              alert("AI couldn't group the lines. Try editing the lyrics first.");
          }
      } catch (e) {
          console.error(e);
          alert("Failed to group lines with AI.");
      } finally {
          setIsGrouping(false);
      }
  };

  // --- DRAWING LOGIC ---
  // Extracted to be pure so it can be called by render loop with any time
  const renderFrame = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      // 1. Draw Background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      const bgImg = document.getElementById('source-img') as HTMLImageElement;
      if (bgImg && bgImg.complete) {
          ctx.drawImage(bgImg, 0, 0, width, height);
          ctx.fillStyle = 'rgba(0,0,0,0.85)'; // Heavy dim
          ctx.fillRect(0, 0, width, height);
      }

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
                  activeLineIdx = upcomingIdx;
              } else {
                  activeLineIdx = lines.length - 1;
              }
          }

          const renderLine = (lineIdx: number, offsetY: number, scale: number, alpha: number) => {
             if (lineIdx < 0 || lineIdx >= lines.length) return;
             const line = lines[lineIdx];
             const displayWords = line.filter(w => !isMetaWord(w.word));
             if (displayWords.length === 0) return;

             const centerY = (height / 2) + offsetY;
             
             let fontSize = 48 * scale;
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

          renderLine(activeLineIdx, 0, 1.2, 1);
          renderLine(activeLineIdx - 1, -80, 0.8, 0.5);
          renderLine(activeLineIdx - 2, -140, 0.6, 0.2);
          renderLine(activeLineIdx + 1, 80, 0.8, 0.5);
          renderLine(activeLineIdx + 2, 140, 0.6, 0.2);

      } else if (alignment) {
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
      ctx.fillText(clipData?.title || "Unknown Track", width / 2, 60);

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
      if (!isRendering && audioRef.current && canvas && ctx) {
          renderFrame(ctx, canvas.width, canvas.height, audioRef.current.currentTime);
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
  }, [selectedClipId, alignment, lines, isRendering]);

  // --- OFFLINE RENDERING LOGIC ---
  const startOfflineRender = async () => {
    if (!clipData || !audioRef.current || !canvasRef.current) return;
    
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

        // 2. Setup Muxer with FileSystem Strategy if available
        const filename = `${clipData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_offline.webm`;
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
                // If user cancels, stop rendering
                if (err.name === 'AbortError') {
                    setIsRendering(false);
                    return;
                }
                console.warn("File System Access failed, falling back to RAM.", err);
            }
        }

        // Fallback to RAM
        if (!muxerTarget) {
            muxerTarget = new ArrayBufferTarget();
        }

        const muxer = new Muxer({
            target: muxerTarget,
            video: {
                codec: 'V_VP9',
                width: 1280,
                height: 720
            },
            audio: {
                codec: 'A_OPUS',
                numberOfChannels: 2,
                sampleRate: 48000 // Encoder output rate
            }
        });

        // 3. Setup Video Encoder
        // @ts-ignore
        const videoEncoder = new VideoEncoder({
            output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
            error: (e: any) => console.error("Video Encoder error", e)
        });
        videoEncoder.configure({
            codec: 'vp09.00.10.08',
            width: 1280,
            height: 720,
            bitrate: 4_000_000, // 4Mbps
            framerate: 30
        });

        // 4. Setup Audio Encoder
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

        // 5. Render Video Frames with BACKPRESSURE
        const fps = 30;
        const totalFrames = Math.ceil(duration * fps);
        const ctx = canvasRef.current.getContext('2d')!;
        
        for (let i = 0; i < totalFrames; i++) {
            // BACKPRESSURE: If encoder queue is full, wait.
            // This prevents "Low RAM" crashes by ensuring we don't buffer too many frames in memory.
            if (videoEncoder.encodeQueueSize > 5) {
                while (videoEncoder.encodeQueueSize > 2) {
                    await new Promise(r => setTimeout(r, 10));
                }
            }

            const t = i / fps;
            renderFrame(ctx, 1280, 720, t);
            
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

        // 6. Encode Audio
        // We need to pass data to AudioEncoder as AudioData objects.
        // We'll chunk the AudioBuffer into smaller pieces (e.g. 1 second)
        // Note: AudioEncoder expects planar float32 for Opus usually.
        
        const numberOfChannels = 2; // Stereo
        const sourceChannels = audioBuffer.numberOfChannels;
        const audioDataLength = audioBuffer.length;
        const sourceSampleRate = audioBuffer.sampleRate;
        
        // Helper to mix down or expand channels to stereo
        const getChannelData = (channel: number) => {
             if (channel < sourceChannels) return audioBuffer.getChannelData(channel);
             // If source is mono, duplicate ch0 for ch1
             return audioBuffer.getChannelData(0);
        };

        const chunkFrames = 48000; // 1 second chunks roughly
        for (let offset = 0; offset < audioDataLength; offset += chunkFrames) {
            const end = Math.min(offset + chunkFrames, audioDataLength);
            const frames = end - offset;
            
            // Prepare planar buffer [ch0...][ch1...]
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

        // 7. Flush Encoders
        await videoEncoder.flush();
        await audioEncoder.flush();
        muxer.finalize();

        // 8. Close Stream or Download
        if (writableStream) {
            await writableStream.close();
        } else {
            // RAM Fallback: Download the buffer
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
        // Resume Preview loop
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
                            src={clipData.imageUrl} 
                            alt="Cover" 
                            crossOrigin="anonymous" // CRITICAL FOR CANVAS EXPORT
                            className="w-full aspect-square object-cover"
                         />
                         <div className="p-4">
                             <h3 className="font-bold text-white text-lg truncate">{clipData.title}</h3>
                             <p className="text-xs text-slate-400 font-mono mb-4">{clipData.id}</p>
                             
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
                     <div className="bg-black border border-slate-700 rounded-xl overflow-hidden shadow-2xl relative aspect-video flex items-center justify-center">
                         <canvas 
                            ref={canvasRef}
                            width={1280}
                            height={720}
                            className="w-full h-full object-contain"
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
                         <span>1280x720 • 30fps</span>
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
