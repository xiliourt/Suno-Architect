import React from 'react';
import { ParsedSunoOutput } from '../types';
import CopyButton from './CopyButton';

interface OutputSectionProps {
  data: ParsedSunoOutput;
}

const OutputSection: React.FC<OutputSectionProps> = ({ data }) => {
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
            <CopyButton text={data.lyricsWithTags} label="Copy Lyrics" />
          </div>
          <div className="p-4 bg-slate-900/30">
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