import React, { useState } from 'react';
import { ParsedSunoOutput } from '../types';
import CopyButton from './CopyButton';
import { triggerSunoGeneration } from '../services/sunoApi';

interface OutputSectionProps {
  data: ParsedSunoOutput;
  sunoCookie?: string;
  sunoModel?: string;
  onSyncSuccess?: (response: any, originalData: ParsedSunoOutput) => void;
}

const OutputSection: React.FC<OutputSectionProps> = ({ data, sunoCookie, sunoModel, onSyncSuccess }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{success: boolean, msg: string} | null>(null);

  const handleSyncToSuno = async () => {
    if (!sunoCookie) return;
    setIsSyncing(true);
    setSyncStatus(null);
    
    try {
        const result = await triggerSunoGeneration(data, sunoCookie, sunoModel);
        setSyncStatus({ success: true, msg: "Successfully sent to Suno!" });
        if (onSyncSuccess) {
            onSyncSuccess(result, data);
        }
    } catch (err: any) {
        setSyncStatus({ success: false, msg: err.message || "Failed to sync." });
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Title & Style Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.title && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
            <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider">Title</h3>
                <CopyButton text={data.title} label="Copy" />
            </div>
            <div className="p-4 bg-slate-900/30 flex-grow">
                <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
                    <p className="font-mono text-lg font-bold text-white text-center whitespace-pre-wrap break-words">
                    {data.title}
                    </p>
                </div>
            </div>
            </div>
        )}

        {data.style && (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col">
            <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center shrink-0">
                <h3 className="text-sm font-semibold text-purple-300 uppercase tracking-wider">Style Tags</h3>
                <CopyButton text={data.style} label="Copy" />
            </div>
            <div className="p-4 bg-slate-900/30 flex-grow">
                <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
                    <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 w-full break-words">
                    {data.style}
                    </pre>
                </div>
            </div>
            </div>
        )}
      </div>

      {/* Advanced Parameters */}
      {data.advancedParams && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-wrap gap-4 justify-between items-center">
           <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider min-w-[150px]">Advanced Params:</h3>
           <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300 font-mono">
              {data.advancedParams.split('\n').map((param, i) => (
                  <span key={i} className="flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 mr-2"></span>
                    {param.replace(/^\W+/, '')}
                  </span>
              ))}
               {data.excludeStyles && (
                  <span className="flex items-center text-red-300">
                     <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2"></span>
                     Exclude: {data.excludeStyles}
                  </span>
               )}
           </div>
        </div>
      )}

      {/* Structured Lyrics */}
      {data.lyricsWithTags && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
          <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-pink-300 uppercase tracking-wider">Lyrics + Meta Tags</h3>
                <span className="text-xs bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">Suno Optimized</span>
             </div>
            <div className="flex items-center gap-2">
                {/* Sync Button */}
                {sunoCookie && (
                    <button
                        onClick={handleSyncToSuno}
                        disabled={isSyncing}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border flex items-center space-x-2
                        ${isSyncing ? 'bg-pink-600/50 border-pink-500/50 text-white cursor-wait' : 'bg-pink-700/80 border-pink-600 text-pink-100 hover:bg-pink-600'}`}
                    >
                        {isSyncing ? (
                             <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                             </svg>
                        ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        )}
                        <span>{isSyncing ? 'Sending...' : 'Sync to Suno'}</span>
                    </button>
                )}
                <CopyButton text={data.lyricsWithTags} label="Copy Lyrics" />
            </div>
          </div>
          <div className="p-4 bg-slate-900/30 relative">
             {syncStatus && (
                 <div className={`absolute top-0 left-0 right-0 p-2 text-xs text-center font-bold ${syncStatus.success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                     {syncStatus.msg}
                 </div>
             )}
            <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
               <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 leading-relaxed break-words">
                  {data.lyricsWithTags}
               </pre>
            </div>
          </div>
        </div>
      )}

      {/* Javascript Code */}
      {data.javascriptCode && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
          <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-yellow-300 uppercase tracking-wider">Console Code (JavaScript)</h3>
            <CopyButton text={data.javascriptCode} label="Copy Code" />
          </div>
          <div className="p-4 bg-slate-900/30">
            <div className="max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
               <pre className="whitespace-pre-wrap font-mono text-xs text-yellow-100/70 break-words">
                  {data.javascriptCode}
               </pre>
            </div>
          </div>
        </div>
      )}

       {/* Clean Lyrics */}
       {data.lyricsAlone && (
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden shadow-lg opacity-80 hover:opacity-100 transition-opacity">
          <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wider">Lyrics Only</h3>
            <CopyButton text={data.lyricsAlone} label="Copy Clean" />
          </div>
          <div className="p-4 bg-slate-900/30">
             <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-400 break-words">
                  {data.lyricsAlone}
                </pre>
             </div>
          </div>
        </div>
      )}

      {/* Fallback if parsing failed */}
      {!data.style && !data.lyricsWithTags && data.fullResponse && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6">
              <h3 className="text-red-400 mb-2 font-bold">Parsing Error - Raw Output</h3>
              <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 break-words">{data.fullResponse}</pre>
          </div>
      )}
    </div>
  );
};

export default OutputSection;