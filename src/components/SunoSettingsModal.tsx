import React, { useState, useEffect } from 'react';
import CopyButton from './CopyButton';
import { getSunoCredits } from '../services/sunoApi';
import { SUNO_MODEL_MAPPINGS } from '../constants';

interface SunoSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cookie: string, model: string) => void;
  initialCookie: string;
  initialModel: string;
  currentCredits: number | null;
}

const SunoSettingsModal: React.FC<SunoSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialCookie, 
  initialModel,
  currentCredits 
}) => {
  const [cookie, setCookie] = useState('');
  const [model, setModel] = useState('chirp-bluejay');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{success: boolean, msg: string} | null>(null);
  const [localCredits, setLocalCredits] = useState<number | null>(null);

  useEffect(() => {
    setCookie(initialCookie);
    setModel(initialModel || 'chirp-bluejay');
    setLocalCredits(currentCredits);
  }, [initialCookie, initialModel, currentCredits, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(cookie, model);
    onClose();
  };

  const handleVerify = async () => {
      if (!cookie) {
          setVerifyStatus({ success: false, msg: "Please enter a token first." });
          return;
      }
      setIsVerifying(true);
      setVerifyStatus(null);
      try {
          const credits = await getSunoCredits(cookie);
          setLocalCredits(credits);
          setVerifyStatus({ success: true, msg: "Connected Successfully!" });
          // Auto-save on success? Maybe not, let user confirm.
      } catch (e: any) {
          setLocalCredits(null);
          setVerifyStatus({ success: false, msg: "Login Failed. Check token." });
      } finally {
          setIsVerifying(false);
      }
  };

  const tokenSnippet = `(function() {
    const sessionCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('__session='))
        ?.split('=')[1];

    if (sessionCookie) {
        console.log("%c Suno Session Token Found! ", "background: #222; color: #bada55; font-size: 14px;");
        console.log(sessionCookie);
        copy(sessionCookie); 
        console.log("%c Result copied to clipboard automatically.", "color: gray;");
    } else {
        console.error("Session token not found. Make sure you are logged in at suno.com");
    }
})();`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="bg-slate-800 p-2 rounded-lg">
             {/* Suno/Music Icon */}
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-pink-400">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
            </svg>
          </span>
          Suno API Configuration
        </h2>

        <div className="space-y-6">
          <p className="text-sm text-slate-400 leading-relaxed">
            To sync directly with Suno, provide your <strong>Authorization Token</strong> (Bearer) or Session Cookie.
          </p>

           {/* 1. Auto-Get Token Script (Moved to Top) */}
           <div className="bg-slate-950/50 border border-purple-500/20 rounded-xl p-4">
             <div className="flex justify-between items-start mb-2">
                <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                    Auto-Get Token Script
                </h3>
                <CopyButton text={tokenSnippet} label="Copy Script" />
             </div>
             <p className="text-xs text-slate-400 mb-3">
                 1. Go to <a href="https://suno.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">suno.com</a> and log in.<br/>
                 2. Open Developer Tools (F12) &gt; Console.<br/>
                 3. Paste this code and hit Enter. The token will be copied to your clipboard.
             </p>
             <div className="bg-black/50 rounded-lg p-3 overflow-x-auto border border-white/5 shadow-inner">
                 <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap">{tokenSnippet}</pre>
             </div>
          </div>

          {/* 2. Token Input */}
          <div>
            <div className="flex justify-between items-center mb-2">
                 <label className="block text-sm font-medium text-slate-300">
                    Suno Token / Cookie
                 </label>
                 {localCredits !== null && (
                     <span className="text-xs font-bold text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded">
                         Credits: {localCredits}
                     </span>
                 )}
            </div>
            <textarea
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="Paste your Bearer Token (ey...) here..."
              className="w-full h-24 bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none custom-scrollbar resize-none"
            />
            
            <div className="flex justify-between items-center mt-2">
                <span className="text-yellow-500/80 text-xs block bg-yellow-900/10 p-2 rounded border border-yellow-900/30 flex-1 mr-4">
                ⚠️ <strong>Recommendation:</strong> Use the <strong>Bearer Token</strong>.
                </span>
                <button
                    onClick={handleVerify}
                    disabled={isVerifying || !cookie}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap
                        ${isVerifying ? 'bg-slate-700 text-slate-400 cursor-wait' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                >
                    {isVerifying ? 'Checking...' : 'Login & Verify'}
                </button>
            </div>
            {verifyStatus && (
                <div className={`mt-2 text-xs font-medium ${verifyStatus.success ? 'text-green-400' : 'text-red-400'}`}>
                    {verifyStatus.msg}
                </div>
            )}
          </div>

          {/* 3. Model Selection (Moved to Bottom) */}
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
             <label className="block text-sm font-medium text-slate-300 mb-2">
                Generation Model
             </label>
             <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all appearance-none"
             >
                {SUNO_MODEL_MAPPINGS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label} ({m.value})</option>
                ))}
             </select>
             <p className="text-xs text-slate-500 mt-2">
                 Select the audio model version to use for generations.
             </p>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-lg shadow-lg hover:shadow-pink-500/25 transition-all"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SunoSettingsModal;