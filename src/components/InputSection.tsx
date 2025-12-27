import React, { useState, useRef } from 'react';
import { FileContext } from '../types';

interface InputSectionProps {
  onGenerate: (prompt: string, file?: FileContext) => void;
  isLoading: boolean;
  apiKeyValid: boolean;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, isLoading, apiKeyValid }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((prompt.trim() || selectedFile) && apiKeyValid) {
      onGenerate(prompt, selectedFile || undefined);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedFile({
            name: file.name,
            mimeType: file.type,
            data: event.target.result as string
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isButtonDisabled = isLoading || (!prompt.trim() && !selectedFile) || !apiKeyValid;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 shadow-xl relative">
      <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-4">
        Describe Your Song
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-slate-400 mb-2">
            Story, Topic, or Vibe
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="E.g., An epic power ballad about a space explorer lost in the void. Or upload an image for inspiration."
            className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-base"
          />
        </div>

        {/* File Upload Context Area */}
        <div>
           <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,text/plain,application/pdf"
              className="hidden"
           />
           
           {!selectedFile ? (
               <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-purple-400 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/50 border border-transparent hover:border-slate-700"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  <span>Add Context (Image, Text, PDF)</span>
               </button>
           ) : (
               <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-2 max-w-max animate-in fade-in slide-in-from-left-2">
                   <div className="bg-purple-900/50 p-1.5 rounded-md">
                        {selectedFile.mimeType.startsWith('image') ? (
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-purple-300">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                             </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-purple-300">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        )}
                   </div>
                   <span className="text-xs text-slate-300 truncate max-w-[200px]" title={selectedFile.name}>{selectedFile.name}</span>
                   <button 
                      type="button" 
                      onClick={clearFile}
                      className="text-slate-500 hover:text-red-400 p-1 rounded-full hover:bg-slate-800 transition-colors"
                   >
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                       </svg>
                   </button>
               </div>
           )}
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
                <span>Constructing...</span>
                </>
            ) : (
                <>
                <span>Generate Prompt</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.828 11.418a.75.75 0 00-1.061-.44l-1.022.463-.092.043a.75.75 0 00.323 1.39l.606-.275 1.077.488a.75.75 0 00.17.067l.154.015a.75.75 0 00.843-.695l.006-.056v-.063z" />
                </svg>
                </>
            )}
            </button>

            {/* Popup / Tooltip for Missing Key */}
            {!apiKeyValid && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 w-72 p-4 bg-slate-800 border border-purple-500/30 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-center pointer-events-auto">
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-slate-800 border-b border-r border-purple-500/30 rotate-45"></div>
                    <div className="relative z-10">
                        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3 text-purple-400">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                             </svg>
                        </div>
                        <h3 className="text-white font-bold mb-1">API Key Required</h3>
                        <p className="text-slate-400 text-xs mb-3 leading-relaxed">
                            You need a Gemini API key to generate songs. It's free and easy to get.
                        </p>
                        <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-lg shadow-purple-500/20"
                        >
                            Get API Key
                        </a>
                    </div>
                </div>
            )}
        </div>
      </form>
    </div>
  );
};

export default InputSection;
