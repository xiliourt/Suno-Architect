import React, { useState } from 'react';
import { SunoClip, AlignedWord } from '../types';
import CopyButton from './CopyButton';
import { getLyricAlignment, updateSunoMetadata } from '../services/sunoApi';

interface HistorySectionProps {
  history: SunoClip[];
  onUpdateClip: (id: string, updates: Partial<SunoClip>) => void;
  sunoCookie?: string;
}

const HistorySection: React.FC<HistorySectionProps> = ({ history, onUpdateClip, sunoCookie }) => {
  const [selectedClip, setSelectedClip] = useState<SunoClip | null>(null);
  const [manualIdInput, setManualIdInput] = useState('');
  
  // Loading States
  const [loadingAlignment, setLoadingAlignment] = useState(false);
  const [alignmentError, setAlignmentError] = useState<string | null>(null);

  const handleDownloadImage = async (e: React.MouseEvent, url: string, filename: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent clicking through to the song link if overlaid
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (err) {
      console.warn("Fetch download failed, falling back to direct link", err);
    }
    // Fallback
    window.open(url, '_blank');
  };

  const handleDownloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  };

  const closeModal = () => {
    setSelectedClip(null);
    setManualIdInput('');
    setAlignmentError(null);
    setLoadingAlignment(false);
  };

  const isDraft = (clip: SunoClip) => clip.id.startsWith('draft_');

  const handleLinkSunoId = () => {
    if (!selectedClip || !manualIdInput.trim()) return;
    const newId = manualIdInput.trim();
    
    onUpdateClip(selectedClip.id, { 
        id: newId, 
        model_name: selectedClip.model_name.includes('Draft') ? 'Linked via ID' : selectedClip.model_name
    });
    
    // Update local state to reflect change immediately in modal
    setSelectedClip(prev => prev ? ({ ...prev, id: newId }) : null);
    setManualIdInput('');
  };

  const handleGetAlignment = async () => {
      if (!selectedClip || !sunoCookie || isDraft(selectedClip)) return;
      
      setLoadingAlignment(true);
      setAlignmentError(null);
      
      try {
          // Update metadata first if we have the original data (clean lyrics)
          if (selectedClip.originalData?.fullResponse) {
              await updateSunoMetadata(selectedClip.id, selectedClip.originalData, sunoCookie);
          }

          const result = await getLyricAlignment(selectedClip.id, sunoCookie);
          if (result && result.aligned_words) {
              const newData = result.aligned_words;
              // Persist to history
              onUpdateClip(selectedClip.id, { alignmentData: newData });
              // Update local state
              setSelectedClip(prev => prev ? ({ ...prev, alignmentData: newData }) : null);
          } else {
              setAlignmentError("No alignment data found.");
          }
      } catch (e: any) {
          setAlignmentError(e.message || "Failed to fetch alignment.");
      } finally {
          setLoadingAlignment(false);
      }
  };

  // --- LRC Logic ---

  // Helper function to format time into LRC format [mm:ss.xx]
  const formatLrcTime = (seconds: number) => {
      const date = new Date(0);
      date.setMilliseconds(seconds * 1000); // Convert seconds to milliseconds
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const secs = String(date.getUTCSeconds()).padStart(2, '0');
      const hundredths = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, '0'); // Convert milliseconds to hundredths of a second
      return `[${minutes}:${secs}.${hundredths}]`;
  };

  // Function to convert aligned words to LRC format
  const convertToLRC = (alignedWords: AlignedWord[]) => {
      let lrcContent = '';
      alignedWords.forEach(wordObj => {
          const time = formatLrcTime(wordObj.start_s);
          lrcContent += `${time}${wordObj.word}\n`;
      });
      return lrcContent;
  };

  // --- SRT Logic ---

  // Helper function to format time into SRT format (HH:MM:SS,MS)
  const formatSrtTime = (seconds: number) => {
      const date = new Date(0);
      date.setMilliseconds(seconds * 1000); // Convert seconds to milliseconds
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const secs = String(date.getUTCSeconds()).padStart(2, '0');
      const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${secs},${milliseconds}`;
  };

  // Function to convert aligned words to SRT format
  const convertToSRT = (alignedWords: AlignedWord[]) => {
      let srtContent = '';
      alignedWords.forEach((wordObj, index) => {
          const startTime = formatSrtTime(wordObj.start_s);
          const endTime = formatSrtTime(wordObj.end_s);
          srtContent += `${index + 1}\n`;
          srtContent += `${startTime} --> ${endTime}\n`;
          srtContent += `${wordObj.word}\n\n`;
      });
      return srtContent;
  };


  const handleGenerateLRC = () => {
      if (!selectedClip?.alignmentData) return;
      const lrc = convertToLRC(selectedClip.alignmentData);
      
      // Persist
      onUpdateClip(selectedClip.id, { lrcContent: lrc });
      // Update local
      setSelectedClip(prev => prev ? ({ ...prev, lrcContent: lrc }) : null);
  };

  const handleGenerateSRT = () => {
      if (!selectedClip?.alignmentData) return;
      const srt = convertToSRT(selectedClip.alignmentData);
      
      // Persist
      onUpdateClip(selectedClip.id, { srtContent: srt });
      // Update local
      setSelectedClip(prev => prev ? ({ ...prev, srtContent: srt }) : null);
  };

  const formatDisplayTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-600 min-h-[400px]">
        <p className="text-lg font-medium">No History Yet</p>
        <p className="text-sm mt-1">Generated songs and prompts will appear here.</p>
      </div>
    );
  }

  // Helper to safely get data, falling back to basic metadata if originalData is missing
  const getClipData = (clip: SunoClip) => {
      const orig = clip.originalData;
      return {
          title: clip.title || orig?.title || 'Untitled',
          style: orig?.style || clip.metadata.tags || '',
          excludeStyles: orig?.excludeStyles || '',
          advancedParams: orig?.advancedParams || '',
          lyrics: orig?.lyricsWithTags || clip.metadata.prompt || '',
          cleanLyrics: orig?.lyricsAlone || '',
          vocalGender: orig?.vocalGender,
          weirdness: orig?.weirdness,
          influence: orig?.styleInfluence,
          isRich: !!orig?.fullResponse
      };
  };

  const clipData = selectedClip ? getClipData(selectedClip) : null;

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-500">
      {history.map((clip) => {
        const isItemDraft = isDraft(clip);
        // Prioritize explicit image URL from API, otherwise construct it
        const imageUrl = clip.imageUrl || `https://cdn2.suno.ai/image_${clip.id}.jpeg?width=100`;
        const largeImageUrl = clip.imageLargeUrl || `https://cdn2.suno.ai/image_large_${clip.id}.jpeg`;
        const songUrl = `https://suno.com/song/${clip.id}`;
        
        return (
          <div 
            key={clip.id} 
            onClick={() => setSelectedClip(clip)}
            className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg hover:shadow-purple-500/10 transition-all hover:border-slate-600 flex flex-row h-[100px] cursor-pointer group/card"
          >
            <div className="relative w-[100px] h-full shrink-0 bg-slate-900 group">
              {isItemDraft ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 opacity-50">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                </div>
              ) : (
                <>
                <img 
                    src={imageUrl} 
                    alt={clip.title || 'Generated Song'} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/100x100/1e293b/475569?text=No+Image';
                    }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                    <a 
                        href={songUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-white p-2 rounded-full bg-purple-600 hover:bg-purple-500 shadow-sm transform hover:scale-110 transition-transform"
                        title="Listen on Suno"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </a>

                    {/* Download Button Overlay */}
                    <button
                        onClick={(e) => handleDownloadImage(e, largeImageUrl, `${clip.title || 'suno-cover'}.jpeg`)}
                        className="absolute top-1 right-1 text-white/70 hover:text-white bg-black/60 hover:bg-black/80 p-1 rounded backdrop-blur-sm transition-all transform hover:scale-105"
                        title="Download High-Res Cover Art"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                </div>
                </>
              )}
            </div>
            
            <div className="p-3 flex-grow flex flex-col justify-between overflow-hidden">
              <div>
                  <h3 className="text-base font-bold text-white truncate leading-tight mb-1 group-hover/card:text-purple-400 transition-colors" title={clip.title}>
                    {clip.title || 'Untitled Song'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                     <span className={`font-mono px-1.5 py-0.5 rounded ${isItemDraft ? 'bg-slate-700 text-slate-300' : 'bg-slate-900 text-slate-400'}`}>
                        {clip.model_name}
                     </span>
                     <span>•</span>
                     <span>{new Date(clip.created_at).toLocaleDateString()}</span>
                  </div>
              </div>
              
              <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-500 truncate">
                    Click for details
                  </span>
                  {!isItemDraft && (
                    <a 
                        href={songUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline truncate"
                    >
                        View on Suno.com
                    </a>
                  )}
                  {isItemDraft && (
                      <span className="text-xs text-slate-600 italic">Draft Prompt</span>
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* Details Modal */}
    {selectedClip && clipData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeModal}>
            <div 
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-start bg-slate-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white leading-tight pr-4">
                            {clipData.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                             <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{selectedClip.model_name}</span>
                             <span>•</span>
                             <span>{new Date(selectedClip.created_at).toLocaleString()}</span>
                             {isDraft(selectedClip) && (
                                 <span className="bg-yellow-900/50 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-900">Draft</span>
                             )}
                        </div>
                    </div>
                    <button onClick={closeModal} className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-slate-950/30">
                    
                    {/* Style Tags */}
                    {clipData.style && (
                        <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Style Tags</h3>
                                <CopyButton text={clipData.style} label="Copy" />
                             </div>
                             <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                                <p className="text-sm text-slate-200 font-mono break-words">{clipData.style}</p>
                             </div>
                        </div>
                    )}

                    {/* Exclude & Params */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {clipData.excludeStyles && (
                             <div className="space-y-2">
                                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">Excluded Styles</h3>
                                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg h-full">
                                    <p className="text-sm text-red-200 font-mono break-words">{clipData.excludeStyles}</p>
                                </div>
                            </div>
                        )}
                        
                        {clipData.advancedParams && (
                             <div className="space-y-2">
                                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Parameters</h3>
                                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg h-full text-sm text-slate-300 font-mono space-y-1">
                                    {clipData.advancedParams.split('\n').map((line, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <span className="text-blue-500">•</span>
                                            <span>{line.replace(/^\W+/, '')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Lyrics Alignment Section */}
                    {!isDraft(selectedClip) && (
                        <div className="space-y-3 pt-2 border-t border-slate-800">
                             <div className="flex justify-between items-center flex-wrap gap-2">
                                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Timing & Lyrics</h3>
                                <div className="flex flex-wrap items-center gap-2">
                                     {/* 1. Copy JSON Data */}
                                     {selectedClip.alignmentData && (
                                         <CopyButton text={JSON.stringify(selectedClip.alignmentData, null, 2)} label="JSON" />
                                     )}

                                     {/* 2. Fetch Alignment */}
                                     {!selectedClip.alignmentData ? (
                                        sunoCookie ? (
                                            <button
                                                onClick={handleGetAlignment}
                                                disabled={loadingAlignment}
                                                className="px-3 py-1 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 text-xs font-medium rounded-lg transition-colors border border-cyan-700/50 flex items-center gap-2"
                                            >
                                                {loadingAlignment ? (
                                                    <span className="animate-spin h-3 w-3 border-2 border-cyan-400 rounded-full border-t-transparent"></span>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                                        <circle cx="12" cy="12" r="10" />
                                                        <polyline points="12 6 12 12 16 14" />
                                                    </svg>
                                                )}
                                                {loadingAlignment ? 'Fetching...' : 'Get Alignment'}
                                            </button>
                                        ) : (
                                            <span className="text-[10px] text-slate-500 italic">Login to fetch timing</span>
                                        )
                                     ) : (
                                         // 3. Generators
                                         <div className="flex gap-2">
                                             {/* LRC Generation/Download */}
                                             {!selectedClip.lrcContent ? (
                                                <button
                                                    onClick={handleGenerateLRC}
                                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                                                >
                                                    Gen LRC
                                                </button>
                                             ) : (
                                                <div className="flex gap-1">
                                                    <CopyButton text={selectedClip.lrcContent} label="LRC" />
                                                    <button
                                                        onClick={() => handleDownloadTextFile(selectedClip.lrcContent!, `${selectedClip.title || 'song'}.lrc`)}
                                                        className="px-2 py-1 bg-purple-700/50 hover:bg-purple-600 text-purple-100 text-xs font-medium rounded-lg border border-purple-600/50"
                                                        title="Download LRC"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                            <polyline points="7 10 12 15 17 10" />
                                                            <line x1="12" y1="15" x2="12" y2="3" />
                                                        </svg>
                                                    </button>
                                                </div>
                                             )}

                                             {/* SRT Generation/Download */}
                                             {!selectedClip.srtContent ? (
                                                <button
                                                    onClick={handleGenerateSRT}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                                                >
                                                    Gen SRT
                                                </button>
                                             ) : (
                                                <div className="flex gap-1">
                                                    <CopyButton text={selectedClip.srtContent} label="SRT" />
                                                    <button
                                                        onClick={() => handleDownloadTextFile(selectedClip.srtContent!, `${selectedClip.title || 'song'}.srt`)}
                                                        className="px-2 py-1 bg-blue-700/50 hover:bg-blue-600 text-blue-100 text-xs font-medium rounded-lg border border-blue-600/50"
                                                        title="Download SRT"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                            <polyline points="7 10 12 15 17 10" />
                                                            <line x1="12" y1="15" x2="12" y2="3" />
                                                        </svg>
                                                    </button>
                                                </div>
                                             )}
                                         </div>
                                     )}
                                </div>
                             </div>

                             {alignmentError && (
                                 <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/30">
                                     {alignmentError}
                                 </div>
                             )}

                             {selectedClip.alignmentData && (
                                 <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col h-[300px]">
                                     <div className="bg-slate-900/80 px-4 py-2 flex justify-between text-xs font-semibold text-slate-400 border-b border-slate-800">
                                         <span>Timestamp</span>
                                         <span>Word</span>
                                     </div>
                                     <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                         {selectedClip.alignmentData.map((item, idx) => (
                                             <div key={idx} className="flex hover:bg-slate-800/50 rounded px-2 py-1 transition-colors group">
                                                 <span className="text-xs font-mono text-cyan-500 w-24 shrink-0 group-hover:text-cyan-400">
                                                     {formatDisplayTime(item.start_s)}
                                                 </span>
                                                 <span className="text-sm text-slate-300 font-medium group-hover:text-white">
                                                     {item.word.replace(/\n/g, ' ')}
                                                 </span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             )}
                        </div>
                    )}

                    {/* Lyrics - Only show "Lyrics with Meta Tags" if it is rich data (from local generation) */}
                    {clipData.isRich && clipData.lyrics && (
                         <div className="space-y-2 pt-2 border-t border-slate-800">
                             <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider">Lyrics with Meta Tags</h3>
                                <CopyButton text={clipData.lyrics} label="Copy Lyrics" />
                             </div>
                             <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg max-h-[300px] overflow-y-auto custom-scrollbar">
                                <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{clipData.lyrics}</pre>
                             </div>
                        </div>
                    )}

                     {/* Clean Lyrics / Raw Prompt - Always show */}
                     {clipData.cleanLyrics && (
                         <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                    {clipData.isRich ? "Clean Lyrics" : "Lyrics / Prompt"}
                                </h3>
                                <CopyButton text={clipData.cleanLyrics} label="Copy" />
                             </div>
                             <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg max-h-[200px] overflow-y-auto custom-scrollbar">
                                <pre className="text-sm text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">{clipData.cleanLyrics}</pre>
                             </div>
                        </div>
                    )}

                    {/* ID Linking Section */}
                    <div className="pt-4 border-t border-slate-800">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                            Link Suno Generation
                        </label>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={manualIdInput}
                                onChange={(e) => setManualIdInput(e.target.value)}
                                placeholder="Paste Suno Clip ID (UUID) here..."
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                            />
                            <button 
                                onClick={handleLinkSunoId}
                                disabled={!manualIdInput.trim()}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                            >
                                Link ID
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                            If you generated this song on Suno, paste the UUID from the URL to see the cover art and link.
                        </p>
                    </div>

                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
                     {!isDraft(selectedClip) && (
                         <>
                             <a 
                                href={`https://cdn1.suno.ai/${selectedClip.id}.mp3`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                                title="Download MP3"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                MP3
                             </a>

                             <a 
                                href={`https://suno.com/song/${selectedClip.id}`}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-purple-900/20"
                             >
                                Open in Suno
                             </a>
                         </>
                     )}
                     <button 
                        onClick={closeModal}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                     >
                        Close
                     </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default HistorySection;
