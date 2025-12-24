import React, { useState } from 'react';

interface InputSectionProps {
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
  apiKeyValid: boolean;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, isLoading, apiKeyValid }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && apiKeyValid) {
      onGenerate(prompt);
    }
  };

  const isButtonDisabled = isLoading || !prompt.trim() || !apiKeyValid;

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
            placeholder="E.g., An epic power ballad about a space explorer lost in the void, feeling hopeful yet lonely. Influences of 80s synthwave."
            className="w-full h-40 bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-base"
          />
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