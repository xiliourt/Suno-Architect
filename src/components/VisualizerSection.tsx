import React, { useState, useEffect, useRef } from 'react';
import { SunoClip, AlignedWord } from '../types';
import { getLyricAlignment } from '../services/sunoApi';
import { groupLyricsByLines } from '../services/geminiService';

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
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Media Recorder Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

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
   * Helper: Check if a word is a meta tag (contains brackets).
   */
  const isMetaWord = (word: string) => {
      // Aggressively hide anything containing [ or ] to catch split tags like "[Verse" or "1]"
      return word.includes('[') || word.includes(']');
  };

  /**
   * Simple heuristic to group words into lines based on clean text lyrics.
   */
  const simpleLineGroup = (textLyrics: string, aligned: AlignedWord[]): AlignedWord[][] => {
      if (!textLyrics || !aligned || aligned.length === 0) return [];
      
      const cleanText = stripMetaTags(textLyrics);
      const textLines = cleanText.split('\n');
      
      // Filter out any aligned words that look like meta tags
      const cleanAligned = aligned.filter(w => !isMetaWord(w.word));
      
      const groups: AlignedWord[][] = [];
      let wordIdx = 0;

      for (const line of textLines) {
          // Count "meaningful" words (ignore purely punctuation tokens which usually aren't aligned)
          const wordsInLine = line.split(/\s+/).filter(w => /[a-zA-Z0-9\u00C0-\u00FF]/.test(w)).length;
          
          if (wordsInLine === 0) continue;

          const matchedWords: AlignedWord[] = [];
          
          // Consume N words from the aligned stream
          for (let i = 0; i < wordsInLine; i++) {
              if (wordIdx >= cleanAligned.length) break;
              matchedWords.push(cleanAligned[wordIdx]);
              wordIdx++;
          }
          if (matchedWords.length > 0) groups.push(matchedWords);
      }
      
      // Dump remaining words into chunks
      if (wordIdx < cleanAligned.length) {
          const remainder = cleanAligned.slice(wordIdx);
          const chunkSize = 6;
          for (let i = 0; i < remainder.length; i += chunkSize) {
              groups.push(remainder.slice(i, i + chunkSize));
          }
      }

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
        
        // Determine the best source of lyrics
        // We STRIP tags from prompt if we use it fallback
        const rawLyrics = fromHistory.originalData?.lyricsAlone || fromHistory.metadata?.prompt || "";
        
        if (fromHistory.alignmentData) {
            setAlignment(fromHistory.alignmentData);
            // Attempt simple grouping immediately
            const simpleLines = simpleLineGroup(rawLyrics, fromHistory.alignmentData);
            setLines(simpleLines);
        } else if (sunoCookie && !fromHistory.id.startsWith('draft_')) {
             // Fetch alignment if missing
             setIsPreparing(true);
             getLyricAlignment(fromHistory.id, sunoCookie)
                .then(res => {
                    if(res && res.aligned_words) {
                        setAlignment(res.aligned_words);
                        onUpdateClip(fromHistory.id, { alignmentData: res.aligned_words });
                        // Try simple grouping on fetch
                        const simpleLines = simpleLineGroup(rawLyrics, res.aligned_words);
                        setLines(simpleLines);
                    }
                })
                .catch(err => console.error("Failed to fetch alignment for visualizer", err))
                .finally(() => setIsPreparing(false));
        }
    } else {
        // Construct faux clip from ID (Manual Entry)
        setClipData({
            id: selectedClipId,
            title: 'Suno Track',
            created_at: new Date().toISOString(),
            model_name: 'Unknown',
            imageUrl: `https://cdn2.suno.ai/image_large_${selectedClipId}.jpeg`,
            metadata: { tags: '', prompt: '' }
        });
        
        // Fetch alignment for manual ID
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
          // Filter alignment before sending to AI to avoid it trying to group [Verse] tags
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
  const drawCanvas = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !clipData) return;

      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw Background
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      const bgImg = document.getElementById('source-img') as HTMLImageElement;
      if (bgImg && bgImg.complete) {
          ctx.drawImage(bgImg, 0, 0, width, height);
          ctx.fillStyle = 'rgba(0,0,0,0.85)'; // Heavy dim
          ctx.fillRect(0, 0, width, height);
      }

      // 2. Draw Text (Lines)
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

          // Fallback: If in a gap, show the NEXT upcoming line
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
             
             // Filter words for display to ensure no [Tags] show up
             const displayWords = line.filter(w => !isMetaWord(w.word));
             if (displayWords.length === 0) return;

             const centerY = (height / 2) + offsetY;
             
             // Dynamic Font Scaling
             let fontSize = 48 * scale;
             ctx.font = `bold ${fontSize}px Inter, sans-serif`;
             
             // First Pass: Measure total width
             let totalWidth = 0;
             const measurements = displayWords.map(w => {
                 const m = ctx.measureText(w.word + " ");
                 totalWidth += m.width;
                 return m.width;
             });
             
             // Scale down if line is too wide
             const maxW = width * 0.9;
             if (totalWidth > maxW) {
                 const ratio = maxW / totalWidth;
                 fontSize *= ratio;
                 ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                 // Re-measure with new font size
                 totalWidth = 0;
                 measurements.forEach((_, i) => {
                     const m = ctx.measureText(displayWords[i].word + " ");
                     measurements[i] = m.width;
                     totalWidth += m.width;
                 });
             }
             
             let currentX = (width - totalWidth) / 2;

             // Second Pass: Draw words
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

          // Render Lines
          renderLine(activeLineIdx, 0, 1.2, 1);
          renderLine(activeLineIdx - 1, -80, 0.8, 0.5);
          renderLine(activeLineIdx - 2, -140, 0.6, 0.2);
          renderLine(activeLineIdx + 1, 80, 0.8, 0.5);
          renderLine(activeLineIdx + 2, 140, 0.6, 0.2);

      } else if (alignment) {
          // Fallback Teleprompter View
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Strict filter for fallback view
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

      // Title & Progress
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(clipData.title || "Unknown Track", width / 2, 60);

      const audio = audioRef.current;
      if (audio && audio.duration) {
          const pct = audio.currentTime / audio.duration;
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(0, height - 8, width * pct, 8);
      }
  };

  // Animation Loop
  const animate = () => {
      if (audioRef.current) {
          drawCanvas(audioRef.current.currentTime);
          setProgress(audioRef.current.currentTime);
      }
      requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
      if (selectedClipId) {
          requestRef.current = requestAnimationFrame(animate);
      }
      return () => {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
  }, [selectedClipId, alignment, lines]);

  // --- RECORDING LOGIC ---
  const startRecording = async () => {
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      if (!canvas || !audio || !clipData) return;
      
      setIsRecording(true);
      recordedChunksRef.current = [];

      try {
          if (!audioContextRef.current) {
               audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }
          const actx = audioContextRef.current;
          
          if (!sourceNodeRef.current) {
              sourceNodeRef.current = actx.createMediaElementSource(audio);
              destinationNodeRef.current = actx.createMediaStreamDestination();
              sourceNodeRef.current.connect(destinationNodeRef.current);
              sourceNodeRef.current.connect(actx.destination);
          }

          const canvasStream = canvas.captureStream(30); 
          const audioStream = destinationNodeRef.current!.stream;
          const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);

          const options = { mimeType: 'video/webm; codecs=vp9' };
          const recorder = new MediaRecorder(combinedStream, MediaRecorder.isTypeSupported(options.mimeType) ? options : undefined);
          
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };

          recorder.onstop = () => {
              const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${clipData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_lyric_video.webm`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setIsRecording(false);
          };

          mediaRecorderRef.current = recorder;
          audio.currentTime = 0;
          await audio.play();
          recorder.start();

          audio.onended = () => {
              if (recorder.state !== 'inactive') recorder.stop();
          };

      } catch (e) {
          console.error("Recording failed", e);
          setIsRecording(false);
          alert("Recording failed. Please ensure you have interacted with the page explicitly.");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      if (audioRef.current) {
          audioRef.current.pause();
      }
  };


  return (
    <div className="animate-in fade-in duration-500 max-w-5xl mx-auto space-y-8">
        
        {/* Header / Selector */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                 <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Lyric Video Visualizer</h2>
                    <p className="text-sm text-slate-400">Generate a .webm lyric video from any Suno track ID.</p>
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
                                        disabled={isGrouping}
                                        className="mt-2 w-full py-2 bg-slate-700 hover:bg-purple-600 text-white text-xs font-bold rounded transition-colors flex items-center justify-center gap-2"
                                        title="Use AI to group words into lines"
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
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isPreparing || !alignment}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                        ${isRecording 
                            ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' 
                            : !alignment 
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                     >
                         {isRecording ? (
                             <>
                                <span className="w-3 h-3 bg-white rounded-sm"></span>
                                Stop Recording
                             </>
                         ) : (
                             <>
                                <span className="w-3 h-3 bg-white rounded-full"></span>
                                Render Video (.webm)
                             </>
                         )}
                     </button>
                     {isRecording && (
                         <p className="text-xs text-center text-slate-400">
                             Recording in real-time... please wait until the song finishes.
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
                         <span>{isRecording ? 'REC' : 'PREVIEW'}</span>
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
