
import React, { useState } from 'react';
import { SunoClip } from '../../types';
import { getSunoClip } from '../../services/sunoApi';
import { ParsedSunoOutput } from '../../types';
import HistoryToolbar from './HistoryToolbar';
import HistoryCard from './HistoryCard';
import DetailsModal from './DetailsModal';
import { stripMetaTags } from '../../utils/visualizer';

interface HistorySectionProps {
  history: SunoClip[];
  onUpdateClip: (id: string, updates: Partial<SunoClip>) => void;
  onAddClip: (clip: SunoClip) => void;
  sunoCookie?: string;
  onResync: () => void;
  isSyncing: boolean;
}

const HistorySection: React.FC<HistorySectionProps> = ({ history, onUpdateClip, onAddClip, sunoCookie, onResync, isSyncing }) => {
  const [selectedClip, setSelectedClip] = useState<SunoClip | null>(null);
  const [importId, setImportId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const isDraft = (clip: SunoClip) => clip.id.startsWith('draft_');

  const handleImport = async () => {
      if (!importId.trim()) return;
      if (!sunoCookie) {
          alert("Please connect Suno API in settings to import songs by ID.");
          return;
      }
      
      setIsImporting(true);
      try {
          const data = await getSunoClip(importId.trim(), sunoCookie);
          if (data) {
              const metadata = data.metadata || {};
              const clip: SunoClip = {
                  id: data.id,
                  title: data.title || 'Imported Song',
                  created_at: data.created_at || new Date().toISOString(),
                  model_name: data.model_name || 'unknown',
                  imageUrl: data.image_url,
                  imageLargeUrl: data.image_large_url,
                  metadata: {
                      tags: metadata.tags || '',
                      prompt: metadata.prompt || ''
                  },
                  originalData: {
                        style: metadata.tags || '',
                        title: data.title || '',
                        excludeStyles: metadata.negative_tags || '',
                        advancedParams: '',
                        vocalGender: '',
                        weirdness: 0,
                        styleInfluence: 0,
                        lyricsWithTags: metadata.prompt || '',
                        lyricsAlone: stripMetaTags(metadata.prompt || ''),
                        fullResponse: ''
                  }
              };
              onAddClip(clip);
              setImportId('');
          }
      } catch (e) {
          console.error(e);
          alert("Failed to import song. Check ID and Cookie.");
      } finally {
          setIsImporting(false);
      }
  };

  const closeModal = () => {
    setSelectedClip(null);
  };

  const handleUpdateCurrentClip = (id: string, updates: Partial<SunoClip>) => {
      onUpdateClip(id, updates);
      // Also update local state so modal reflects changes instantly
      setSelectedClip(prev => prev ? ({ ...prev, ...updates }) : null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <HistoryToolbar 
        count={history.length}
        importId={importId}
        setImportId={setImportId}
        onImport={handleImport}
        isImporting={isImporting}
        onResync={onResync}
        isSyncing={isSyncing}
      />

      {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-600 min-h-[300px]">
            <p className="text-lg font-medium">No History Yet</p>
            <p className="text-sm mt-1 mb-4">Generated songs and prompts will appear here.</p>
            {!sunoCookie && (
                <p className="text-xs text-purple-400 bg-purple-900/10 px-3 py-1 rounded-full border border-purple-900/30">
                    Connect Suno API in settings to sync your feed.
                </p>
            )}
          </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {history.map((clip) => (
                <HistoryCard 
                    key={clip.id} 
                    clip={clip} 
                    onClick={() => setSelectedClip(clip)}
                    isDraft={isDraft(clip)}
                />
            ))}
        </div>
      )}

      {selectedClip && (
          <DetailsModal 
              clip={selectedClip} 
              onClose={closeModal} 
              onUpdateClip={handleUpdateCurrentClip}
              sunoCookie={sunoCookie}
              isDraft={isDraft(selectedClip)}
          />
      )}
    </div>
  );
};

export default HistorySection;
