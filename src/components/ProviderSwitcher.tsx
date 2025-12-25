import React, { useState, useEffect, useRef } from 'react';
import { AIProviderConfig, ProviderType } from '../types';
import { createProvider } from '../services/providers/providerFactory';
import { getApiKey } from '../utils/apiKeyStorage';

interface ProviderSwitcherProps {
  providerConfig: AIProviderConfig;
  onConfigChange: (config: AIProviderConfig) => void;
  onOpenSettings: () => void;
}

const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  openapi: 'Custom API',
};

export const ProviderSwitcher: React.FC<ProviderSwitcherProps> = ({
  providerConfig,
  onConfigChange,
  onOpenSettings,
}) => {
  const [isProviderOpen, setIsProviderOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  
  const providerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const modelSearchInputRef = useRef<HTMLInputElement>(null);

  // Fetch models when provider changes
  useEffect(() => {
    const fetchModels = async () => {
      if (!providerConfig.apiKey && providerConfig.type !== 'openapi') {
        setAvailableModels([]);
        return;
      }

      setIsLoadingModels(true);
      try {
        const provider = createProvider(providerConfig);
        const models = await provider.getAvailableModels();
        setAvailableModels(models);
      } catch (error) {
        console.error('Failed to fetch models:', error);
        setAvailableModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    };

    fetchModels();
  }, [providerConfig.type, providerConfig.apiKey, providerConfig.baseUrl]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (providerRef.current && !providerRef.current.contains(event.target as Node)) {
        setIsProviderOpen(false);
      }
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setIsModelOpen(false);
      }
    };

    if (isProviderOpen || isModelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProviderOpen, isModelOpen]);

  const handleProviderChange = (newType: ProviderType) => {
    // Load the API key for the new provider type from separate storage
    const apiKeyForNewProvider = getApiKey(newType);
    
    // Reset config for new provider type
    let newConfig: AIProviderConfig = {
      type: newType,
      model: undefined,
      apiKey: apiKeyForNewProvider, // Load API key for the new provider
      baseUrl: newType === 'openapi' ? providerConfig.baseUrl : undefined,
      authHeader: newType === 'openapi' ? (providerConfig.authHeader || 'x-litellm-api-key') : undefined,
      authPrefix: newType === 'openapi' ? (providerConfig.authPrefix || '') : undefined,
    };
    
    // Load saved OpenAPI settings from localStorage when switching to OpenAPI
    if (newType === 'openapi') {
      try {
        const savedOpenApi = localStorage.getItem('ai_provider_openapi_settings');
        if (savedOpenApi) {
          const parsed = JSON.parse(savedOpenApi);
          newConfig = {
            ...newConfig,
            baseUrl: newConfig.baseUrl || parsed.baseUrl,
            authHeader: newConfig.authHeader || parsed.authHeader,
            authPrefix: newConfig.authPrefix !== undefined ? newConfig.authPrefix : parsed.authPrefix,
          };
        }
      } catch (e) {
        console.warn("Failed to load saved OpenAPI settings", e);
      }
    }
    
    onConfigChange(newConfig);
    setIsProviderOpen(false);
  };

  const handleModelChange = (newModel: string) => {
    onConfigChange({ ...providerConfig, model: newModel });
    setIsModelOpen(false);
    setModelSearchQuery(''); // Clear search when model is selected
  };

  // Fuzzy search function for models
  const fuzzyMatch = (text: string, query: string): boolean => {
    if (!query) return true;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // Exact match
    if (lowerText.includes(lowerQuery)) return true;
    
    // Fuzzy match: check if all query characters appear in order
    let queryIndex = 0;
    for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
      if (lowerText[i] === lowerQuery[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === lowerQuery.length;
  };

  // Filter models based on search query
  const filteredModels = availableModels.filter(model => 
    fuzzyMatch(model, modelSearchQuery)
  );

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isModelOpen && modelSearchInputRef.current) {
      // Small delay to ensure dropdown is rendered
      setTimeout(() => {
        modelSearchInputRef.current?.focus();
      }, 10);
    } else if (!isModelOpen) {
      // Clear search when dropdown closes
      setModelSearchQuery('');
    }
  }, [isModelOpen]);

  const currentProviderLabel = PROVIDER_LABELS[providerConfig.type] || providerConfig.type;
  const currentModel = providerConfig.model || 'Not selected';

  return (
    <div className="flex items-center gap-2">
      {/* Provider Selector */}
      <div className="relative" ref={providerRef}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsProviderOpen(!isProviderOpen);
            setIsModelOpen(false);
          }}
          className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 text-slate-300 text-xs font-medium py-2 px-3 rounded-lg hover:bg-slate-700/50 hover:text-white transition-all min-w-[100px] justify-between"
          title="Select Provider"
        >
          <span className="truncate">{currentProviderLabel}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-3 h-3 transition-transform ${isProviderOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isProviderOpen && (
          <div className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
            {Object.entries(PROVIDER_LABELS).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleProviderChange(type as ProviderType);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between
                  ${providerConfig.type === type
                    ? 'bg-purple-600/20 text-purple-300'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  }`}
              >
                <span>{label}</span>
                {providerConfig.type === type && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-purple-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Model Selector */}
      <div className="relative flex-1" ref={modelRef}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsModelOpen(!isModelOpen);
            setIsProviderOpen(false);
          }}
          disabled={isLoadingModels}
          className="w-full flex items-center gap-2 bg-slate-800/50 border border-slate-700 text-slate-300 text-xs font-medium py-2 px-3 rounded-lg hover:bg-slate-700/50 hover:text-white transition-all justify-between disabled:opacity-50"
          title="Select Model"
        >
          <span className="truncate flex-1 text-left">
            {isLoadingModels ? 'Loading...' : currentModel}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-3 h-3 transition-transform flex-shrink-0 ${isModelOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {isModelOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 flex flex-col max-h-60">
            {/* Search Input */}
            {availableModels.length > 0 && (
              <div className="p-2 border-b border-slate-700">
                <input
                  ref={modelSearchInputRef}
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModelSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    // Prevent form submission
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      // Select first filtered result on Enter
                      if (filteredModels.length > 0) {
                        handleModelChange(filteredModels[0]);
                      }
                    }
                    // Close on Escape
                    if (e.key === 'Escape') {
                      setIsModelOpen(false);
                      setModelSearchQuery('');
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  placeholder="Search models..."
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
            )}
            
            {/* Model List */}
            <div className="overflow-y-auto max-h-48">
              {availableModels.length > 0 ? (
                filteredModels.length > 0 ? (
                  filteredModels.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleModelChange(model);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between hover:bg-slate-700/50
                        ${providerConfig.model === model
                          ? 'bg-purple-600/20 text-purple-300'
                          : 'text-slate-300 hover:text-white'
                        }`}
                    >
                      <span className="truncate">{model}</span>
                      {providerConfig.model === model && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-purple-400 flex-shrink-0">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-400 text-center">
                    No models match "{modelSearchQuery}"
                  </div>
                )
              ) : (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                  {providerConfig.type === 'openapi' && !providerConfig.baseUrl
                    ? 'Configure base URL first'
                    : providerConfig.type !== 'openapi' && !providerConfig.apiKey
                    ? 'API key required'
                    : 'No models available'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings Button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenSettings();
        }}
        className="bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700/50 p-2 rounded-lg transition-all"
        title="Configure Provider Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
};

