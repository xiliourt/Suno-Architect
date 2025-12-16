import React, { useState } from 'react';

interface InputSectionProps {
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 shadow-xl">
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

        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all duration-300 flex items-center justify-center space-x-2
            ${
              isLoading || !prompt.trim()
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
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
      </form>
    </div>
  );
};

export default InputSection;
