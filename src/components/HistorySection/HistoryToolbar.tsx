import React from 'react';

interface HistoryToolbarProps {
  count: number;
  importId: string;
  setImportId: (id: string) => void;
  onImport: () => void;
  isImporting: boolean;
  onResync: () => void;
  isSyncing: boolean;
}

const HistoryToolbar: React.FC<HistoryToolbarProps> = ({ count, importId, setImportId, onImport, isImporting, onResync, isSyncing }) => {
  return (
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm shadow-sm">
        <div className="flex-shrink-0">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Your Library
                {count > 0 && <span className="text-xs font-normal text-slate-400">({count} items)</span>}
            </h2>
            <p className="text-xs text-slate-400">Manage your generated prompts and Suno generations.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <div className="flex gap-2 flex-grow sm:max-w-md">
                <input 
                    type="text" 
                    value={importId}
                    onChange={(e) => setImportId(e.target.value)}
                    placeholder="Add song by ID..."
                    className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-purple-500 outline-none w-full"
                />
                <button 
                    onClick={onImport}
                    disabled={isImporting || !importId.trim()}
                    className="px-3 py-2 bg-slate-800 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
                >
                    {isImporting ? 'Adding...' : 'Add'}
                </button>
            </div>

            <button
                onClick={onResync}
                disabled={isSyncing}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border flex items-center gap-2 shadow-lg
                ${isSyncing 
                ? 'bg-slate-700/50 text-slate-400 border-slate-600 cursor-wait' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600 hover:border-slate-500 hover:text-white'}`}
                title="Clears local drafts and fetches the last 20 clips from Suno"
            >
                {isSyncing ? (
                    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                    </svg>
                )}
                <span>Resync</span>
            </button>
        </div>
    </div>
  );
};

export default HistoryToolbar;