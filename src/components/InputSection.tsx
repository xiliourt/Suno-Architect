import React, { useState, useRef } from 'react';
import { FileContext } from '../types';

interface InputSectionProps {
  onGenerate: (prompt: string, files: FileContext[], numTracks: number) => void;
  isLoading: boolean;
  apiKeyValid: boolean;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, isLoading, apiKeyValid }) => {
  const [prompt, setPrompt] = useState('');
  const [numTracks, setNumTracks] = useState(1);
  const [selectedFiles, setSelectedFiles] = useState<FileContext[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((prompt.trim() || selectedFiles.length > 0) && apiKeyValid) {
      onGenerate(prompt, selectedFiles, numTracks);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      (Array.from(files) as File[]).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setSelectedFiles(prev => [...prev, {
              name: file.name,
              mimeType: file.type,
              data: event.target.result as string
            }]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const isButtonDisabled = isLoading || (!prompt.trim() && selectedFiles.length === 0) || !apiKeyValid;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 shadow-xl relative">
      <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-4">
        Describe Your Album
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-slate-400 mb-2">
            Thematic Idea or Vibe
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="E.g., A concept album about a city submerged under neon waves. Mix of synth-pop and heavy industrial."
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-base"
          />
        </div>

        {/* Tracks Selector */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-slate-300">Tracks to Generate</label>
                <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">{numTracks} {numTracks === 1 ? 'Track' : 'Tracks'}</span>
            </div>
            <input 
                type="range" 
                min="1" 
                max="7" 
                step="1" 
                value={numTracks}
                onChange={(e) => setNumTracks(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-bold px-1">
                <span>Single</span>
                <span>Mini Album (EP)</span>
                <span>Full Album</span>
            </div>
        </div>

        {/* Multi-File Upload Context Area */}
        <div className="space-y-3">
           <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,text/plain,application/pdf,audio/*"
              multiple
              className="hidden"
           />
           
           <div className="flex flex-wrap gap-2">
               {selectedFiles.map((file, idx) => {
                   const isAudio = file.mimeType.startsWith('audio/');
                   const isImage = file.mimeType.startsWith('image/');
                   
                   return (
                       <div key={idx} className={`flex items-center gap-2 bg-slate-900 border ${isAudio ? 'border-pink-500/50' : 'border-slate-700'} rounded-lg p-2 animate-in fade-in zoom-in-95 duration-200`}>
                           <div className={`${isAudio ? 'bg-pink-900/50' : 'bg-purple-900/50'} p-1.5 rounded-md`}>
                                {isAudio ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-pink-300">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l.31-.088a2.25 2.25 0 001.632-2.163V6.553zM5.25 18.103V9.5a2.25 2.25 0 011.569-2.141l9.431-3.144a2.25 2.25 0 012.75 2.141v10.503a2.25 2.25 0 01-1.569 2.141l-9.431 3.144a2.25 2.25 0 01-2.75-2.141V18.103z" />
                                    </svg>
                                ) : isImage ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-purple-300">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                     </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-purple-300">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                )}
                           </div>
                           <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-500 uppercase leading-tight">
                                    {isAudio ? 'Style Reference' : 'Context'}
                                </span>
                                <span className="text-xs text-slate-300 truncate max-w-[120px]" title={file.name}>{file.name}</span>
                           </div>
                           <button 
                              type="button" 
                              onClick={() => removeFile(idx)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded-full hover:bg-slate-800 transition-colors"
                           >
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                   <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                               </svg>
                           </button>
                       </div>
                   );
               })}
               
               <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 hover:border-purple-500/50"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wide">Add Files</span>
               </button>
           </div>
        </div>

        <div className="relative group">
            <button
            type="submit"
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 flex items-center justify-center space-x-2
                ${
                isButtonDisabled
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-70'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white hover:shadow-purple-500/25'
                }`}
            >
            {isLoading ? (
                <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Constructing {numTracks > 1 ? `Album (${numTracks} Tracks)` : 'Prompt'}...</span>
                </>
            ) : (
                <>
                <span>{numTracks > 1 ? `Generate Album (${numTracks} Tracks)` : 'Generate Prompt'}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                </>
            )}
            </button>
            {/* ... Error Tooltip ... */}
        </div>
      </form>
    </div>
  );
};

export default InputSection;