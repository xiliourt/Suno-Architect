import React, { useEffect, useState } from 'react';
import { SUNO_MODEL_MAPPINGS } from '../constants';

interface HeaderProps {
  onKeyUpdate: (key: string) => void;
  onValidationChange: (isValid: boolean) => void;
  onOpenSunoSettings: () => void;
  sunoCredits: number | null;
  sunoModel?: string;
  onModelChange?: (model: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onKeyUpdate, 
  onValidationChange, 
  onOpenSunoSettings,
  sunoCredits,
  sunoModel,
  onModelChange
}) => {
  const [hasKey, setHasKey] = useState(false);
  const [isAiStudio, setIsAiStudio] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
    const checkEnv = async () => {
      const aistudio = (window as any).aistudio;
      let isValid = false;
      let keyToSet = '';

      // 1. Check AI Studio
      if (aistudio && typeof aistudio.hasSelectedApiKey === 'function') {
        try {
          const has = await aistudio.hasSelectedApiKey();
          if (has) {
            isValid = true;
            setIsAiStudio(true);
          }
        } catch (e) {
          console.warn("AI Studio key check failed", e);
        }
      }

      // 2. Check Local Storage if not AI Studio
      if (!isValid) {
        setIsAiStudio(false);
        const stored = localStorage.getItem('gemini_api_key');
        if (stored) {
            isValid = true;
            setManualKey(stored);
            keyToSet = stored;
        } else if (process.env.API_KEY) {
            // 3. Check Environment Variable
            isValid = true;
        }
      }

      setHasKey(isValid);
      onKeyUpdate(keyToSet);
      onValidationChange(isValid);
    };
    
    checkEnv();
  }, [onKeyUpdate, onValidationChange]);

  const handleAction = async () => {
    if (isAiStudio) {
      const aistudio = (window as any).aistudio;
      if (aistudio) {
        try {
          await aistudio.openSelectKey();
          const has = await aistudio.hasSelectedApiKey();
          setHasKey(has);
          onValidationChange(has);
        } catch (e) {
          console.error("AI Studio key selection failed", e);
        }
      }
    } else {
      setShowKeyInput(!showKeyInput);
    }
  };

  const saveManualKey = () => {
    const trimmed = manualKey.trim();
    if (trimmed) {
        localStorage.setItem('gemini_api_key', trimmed);
        setHasKey(true);
        setShowKeyInput(false);
        onKeyUpdate(trimmed);
        onValidationChange(true);
    } else {
        localStorage.removeItem('gemini_api_key');
        
        // If we remove the manual key, we check if env var exists to fallback
        const hasEnv = !!process.env.API_KEY;
        setHasKey(hasEnv);
        onKeyUpdate('');
        onValidationChange(hasEnv);
    }
  };

  return (
    <header className="w-full py-4 px-4 md:px-8 flex items-center justify-between border-b border-slate-800 bg-slate-900/70 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2 rounded-lg shadow-lg shadow-purple-500/20">
          {/* Music Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-white">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Suno <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Architect</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">Powered by Gemini 2.5 Flash</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3 relative">
        {showKeyInput && !isAiStudio && (
            <div className="absolute top-14 right-0 bg-slate-800 border border-slate-700 p-4 rounded-xl shadow-2xl w-80 z-50 animate-in fade-in slide-in-from-top-2">
                <label className="block text-xs font-semibold text-slate-400 mb-2">Enter your Gemini API Key</label>
                <div className="flex gap-2">
                    <input 
                        type="password" 
                        value={manualKey}
                        onChange={(e) => setManualKey(e.target.value)}
                        placeholder="AIza..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder-slate-600"
                    />
                    <button 
                        onClick={saveManualKey}
                        className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-lg transition-colors flex items-center justify-center"
                        title="Save Key"
                    >
                        {/* Check Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </button>
                    <button 
                        onClick={() => setShowKeyInput(false)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg transition-colors flex items-center justify-center"
                        title="Close"
                    >
                        {/* X Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                    Your key is stored locally in your browser. 
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline ml-1 transition-colors">
                        Get an API key
                    </a>
                </p>
            </div>
        )}
        
        {/* Credits Display & Model Selector - Visible when logged in (credits not null) */}
        {sunoCredits !== null && (
          <>
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 px-3 py-1 rounded-lg mr-1 backdrop-blur-sm">
                <div className="flex flex-col items-end leading-none">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Credits</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">{sunoCredits}</span>
                </div>
            </div>

            {/* Header Model Selector */}
            <div className="hidden sm:block">
              <select
                value={sunoModel}
                onChange={(e) => onModelChange && onModelChange(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 text-slate-300 text-xs font-bold py-2 px-2 rounded-lg hover:bg-slate-700/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all cursor-pointer"
                title="Select Suno Model"
              >
                {SUNO_MODEL_MAPPINGS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Suno Settings Button */}
        <button
            onClick={onOpenSunoSettings}
            className="flex items-center gap-2 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 transition-all text-xs font-bold"
            title="Suno Configuration"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Suno API</span>
        </button>

        <button 
            onClick={handleAction}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-lg 
            ${!hasKey 
                ? 'bg-slate-100 text-slate-900 hover:bg-white shadow-purple-500/10' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
            {!hasKey ? (
                <>
                    {/* Zap Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-purple-600">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>{isAiStudio ? 'Login with Google' : 'Set API Key'}</span>
                </>
            ) : (
                <>
                    {/* Key Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    <span>{isAiStudio ? 'API Key' : 'Gemini Key'}</span>
                </>
            )}
        </button>
      </div>
    </header>
  );
};