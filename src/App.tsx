import React, { useState } from 'react';
import InputSection from './components/InputSection';
import OutputSection from './components/OutputSection';
import { Header } from './components/Header';
import { generateSunoPrompt } from './services/geminiService';
import { GenerationState } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    result: null,
  });

  const [customApiKey, setCustomApiKey] = useState('');

  const handleGenerate = async (prompt: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null, result: null }));
    try {
      const result = await generateSunoPrompt(prompt, customApiKey);
      setState({ isLoading: false, error: null, result });
    } catch (err: any) {
      setState({
        isLoading: false,
        error: err.message || "Something went wrong.",
        result: null,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-[#0f172a] to-black text-slate-200 font-sans selection:bg-purple-500/30">
      
      <Header onKeyUpdate={setCustomApiKey} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24">
               <div className="mb-6">
                  <h2 className="text-3xl font-bold text-white mb-2">Create Professional Songs</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Transform your raw ideas into structured, high-quality prompts optimized for Suno AI & Udio. 
                    Includes meta tags, song structure, and production directives.
                  </p>
               </div>
              <InputSection onGenerate={handleGenerate} isLoading={state.isLoading} />
              
              {state.error && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                  <strong>Error:</strong> {state.error}
                </div>
              )}

              {/* Tips Section */}
              <div className="mt-8 p-5 bg-slate-900/50 rounded-xl border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pro Tips</h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">•</span> Be specific about the genre (e.g., "Darkwave" vs "Electronic").
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">•</span> Mention vocal gender and mood.
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">•</span> Paste specific text/stories for the AI to rewrite.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7">
            {state.result ? (
              <OutputSection data={state.result} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-600 min-h-[400px]">
                {!state.isLoading && (
                  <>
                    <div className="w-16 h-16 rounded-full bg-slate-800 mb-4 flex items-center justify-center">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 opacity-50">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                      </svg>
                    </div>
                    <p className="text-lg font-medium">Ready to Generate</p>
                    <p className="text-sm mt-1">Your structured song prompts will appear here.</p>
                  </>
                )}
                {state.isLoading && (
                   <div className="flex flex-col items-center animate-pulse">
                      <div className="h-4 w-3/4 bg-slate-800 rounded mb-3"></div>
                      <div className="h-4 w-1/2 bg-slate-800 rounded mb-3"></div>
                      <div className="h-32 w-full bg-slate-800 rounded"></div>
                   </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;