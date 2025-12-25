import React, { useState, useEffect, useRef } from 'react';
import InputSection from './components/InputSection';
import OutputSection from './components/OutputSection';
import { Header } from './components/Header';
import { generateSunoPrompt } from './services/geminiService';
import { GenerationState, SunoClip, ParsedSunoOutput, PromptSettings, ViewMode, AIProviderConfig } from './types';
import { DEFAULT_SUNO_LIBRARY, DEFAULT_LYRICAL_CONSTRAINTS, buildKnowledgeBase, GET_PROMPT_V1 } from './constants';
import { validateProviderConfig } from './services/providers/providerFactory';
import Footer from './components/Footer';
import SunoSettingsModal from './components/SunoSettingsModal';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
import { getSunoCredits, updateSunoMetadata, getSunoFeed } from './services/sunoApi';
import HistorySection from './components/HistorySection';
import VisualizerSection from './components/VisualizerSection';
import { getApiKey, saveApiKeyForProvider } from './utils/apiKeyStorage';

const App: React.FC = () => {
  const [state, setState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    result: null,
  });

  const [view, setView] = useState<ViewMode>('generator');
  
  // Initialize history from localStorage safely
  const [history, setHistory] = useState<SunoClip[]>(() => {
    try {
      const saved = localStorage.getItem('suno_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse history from local storage", e);
      return [];
    }
  });
  
  const [customApiKey, setCustomApiKey] = useState('');
  const [isKeyValid, setIsKeyValid] = useState(false);
  
  // Provider Configuration State
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig>(() => {
    try {
      const saved = localStorage.getItem('ai_provider_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that it has required fields
        if (parsed.type) {
          const providerType = parsed.type as 'gemini' | 'openrouter' | 'openapi';
          
          // Load API key from separate storage for this provider
          const apiKey = getApiKey(providerType);
          
          // Load OpenAPI settings from separate storage if available
          const openApiSettings = localStorage.getItem('ai_provider_openapi_settings');
          if (openApiSettings && providerType === 'openapi') {
            try {
              const openApiParsed = JSON.parse(openApiSettings);
              const baseUrl = parsed.baseUrl || openApiParsed.baseUrl;
              return {
                ...parsed,
                apiKey: apiKey || parsed.apiKey, // Use stored API key if available, fallback to old config
                baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : baseUrl,
                authHeader: parsed.authHeader || openApiParsed.authHeader,
                authPrefix: parsed.authPrefix !== undefined ? parsed.authPrefix : openApiParsed.authPrefix,
              };
            } catch (e) {
              console.warn("Failed to parse OpenAPI settings", e);
            }
          }
          
          // Normalize baseUrl if present
          if (parsed.baseUrl) {
            parsed.baseUrl = parsed.baseUrl.replace(/\/+$/, '');
          }
          
          return {
            ...parsed,
            apiKey: apiKey || parsed.apiKey, // Use stored API key if available, fallback to old config
          };
        }
      }
    } catch (e) {
      console.error("Failed to parse provider config from localStorage", e);
    }
    
    // Load saved OpenAPI settings if available
    let savedOpenApiSettings: Partial<AIProviderConfig> = {};
    try {
      const openApiSettings = localStorage.getItem('ai_provider_openapi_settings');
      if (openApiSettings) {
        savedOpenApiSettings = JSON.parse(openApiSettings);
      }
    } catch (e) {
      console.warn("Failed to parse saved OpenAPI settings", e);
    }
    
    // Default to Gemini with values from .env or defaults
    const envProviderType = (import.meta.env.VITE_AI_PROVIDER_TYPE || 'gemini') as 'gemini' | 'openrouter' | 'openapi';
    const envModel = import.meta.env.VITE_AI_PROVIDER_MODEL || 'gemini-3-flash-preview';
    const envApiKey = getApiKey(envProviderType);
    const envBaseUrl = import.meta.env.VITE_OPENAPI_BASE_URL || '';

    return {
      type: envProviderType,
      apiKey: envApiKey,
      model: envModel,
      baseUrl: envProviderType === 'openapi' 
        ? ((envBaseUrl || savedOpenApiSettings.baseUrl || '').replace(/\/+$/, '') || undefined)
        : undefined,
      authHeader: envProviderType === 'openapi' 
        ? (savedOpenApiSettings.authHeader || 'x-litellm-api-key')
        : undefined,
      authPrefix: envProviderType === 'openapi' 
        ? (savedOpenApiSettings.authPrefix !== undefined ? savedOpenApiSettings.authPrefix : '')
        : undefined,
    };
  });

  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

  // Legacy Gemini Model State (for backward compatibility)
  const [geminiModel, setGeminiModel] = useState<string>(() => {
      return localStorage.getItem('gemini_model') || providerConfig.model || 'gemini-3-flash-preview';
  });

  const handleGeminiModelChange = (model: string) => {
      setGeminiModel(model);
      localStorage.setItem('gemini_model', model);
      // Also update provider config if using Gemini
      if (providerConfig.type === 'gemini') {
        setProviderConfig({ ...providerConfig, model });
      }
  };
  
  // Suno Configuration State
  const [isSunoModalOpen, setIsSunoModalOpen] = useState(false);
  const [sunoCookie, setSunoCookie] = useState('');
  const [sunoModel, setSunoModel] = useState('chirp-bluejay'); // Default to V4.5+
  const [sunoCredits, setSunoCredits] = useState<number | null>(null);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  // Prompt Settings State
  const [promptSettings, setPromptSettings] = useState<PromptSettings>(() => {
      try {
          const saved = localStorage.getItem('suno_prompt_settings');
          if (saved) return JSON.parse(saved);
      } catch(e) {}
      
      // Default Initial State
      const kb = buildKnowledgeBase(DEFAULT_SUNO_LIBRARY);
      return {
          version: 'v1',
          customSystemPrompt: GET_PROMPT_V1(kb),
          library: DEFAULT_SUNO_LIBRARY,
          constraints: DEFAULT_LYRICAL_CONSTRAINTS
      };
  });

  // Ref to prevent double fetching in strict mode
  const historyFetchedRef = useRef(false);

  // Load Suno Cookie and Model from local storage on mount
  useEffect(() => {
    const savedCookie = localStorage.getItem('suno_cookie');
    const savedModel = localStorage.getItem('suno_model');
    
    if (savedCookie) {
      setSunoCookie(savedCookie);
      // Try to fetch credits silently on load if cookie exists
      getSunoCredits(savedCookie).then(setSunoCredits).catch(console.error);
      
      // Fetch History if not already fetched
      if (!historyFetchedRef.current) {
          historyFetchedRef.current = true;
          fetchAndMergeSunoHistory(savedCookie);
      }
    }
    if (savedModel) {
      setSunoModel(savedModel);
    }
  }, []);

  // Persist history whenever it changes
  useEffect(() => {
    localStorage.setItem('suno_history', JSON.stringify(history));
  }, [history]);

  // Persist prompt settings
  useEffect(() => {
      localStorage.setItem('suno_prompt_settings', JSON.stringify(promptSettings));
  }, [promptSettings]);

  // Load API key when provider type changes (only if not already set)
  useEffect(() => {
    // Only load if API key is not set or is different from stored
    const storedApiKey = getApiKey(providerConfig.type);
    if (storedApiKey && (!providerConfig.apiKey || storedApiKey !== providerConfig.apiKey)) {
      setProviderConfig(prev => ({ ...prev, apiKey: storedApiKey }));
    }
  }, [providerConfig.type]);

  // Persist provider config and API keys separately
  useEffect(() => {
    // Save API key separately for the current provider
    if (providerConfig.apiKey) {
      saveApiKeyForProvider(providerConfig.type, providerConfig.apiKey);
    }
    
    // Save config without API key (for privacy and to avoid overwriting)
    const configToSave = {
      ...providerConfig,
      apiKey: undefined, // Don't store API key in config, it's stored separately
    };
    localStorage.setItem('ai_provider_config', JSON.stringify(configToSave));
    
    // Store OpenAPI-specific settings separately so they persist when switching providers
    if (providerConfig.type === 'openapi') {
      const openApiSettings = {
        baseUrl: providerConfig.baseUrl,
        authHeader: providerConfig.authHeader,
        authPrefix: providerConfig.authPrefix,
      };
      localStorage.setItem('ai_provider_openapi_settings', JSON.stringify(openApiSettings));
    }
  }, [providerConfig]);

  // Validate provider config whenever it changes
  useEffect(() => {
    const isValid = validateProviderConfig(providerConfig);
    setIsKeyValid(isValid);
  }, [providerConfig]);

  const fetchAndMergeSunoHistory = async (cookie: string) => {
    try {
        const feedData = await getSunoFeed(cookie);
        if (feedData && Array.isArray(feedData.clips)) {
            const newClips: SunoClip[] = feedData.clips.map((clip: any) => {
                // Map the remote clip to our SunoClip structure
                const metadata = clip.metadata || {};
                const tags = metadata.tags || '';
                const prompt = metadata.prompt || '';
                const title = clip.title || 'Untitled';

                // Construct a faux originalData to make it compatible with our editor
                // We leave fullResponse empty to indicate this is an API pull
                const originalData: ParsedSunoOutput = {
                    style: tags,
                    title: title,
                    excludeStyles: metadata.negative_tags || '',
                    advancedParams: '', // Can't easily reconstruct raw params string
                    vocalGender: '', // Could try to extract from tags
                    weirdness: metadata.control_sliders?.weirdness_constraint ? Math.round(metadata.control_sliders.weirdness_constraint * 100) : 50,
                    styleInfluence: metadata.control_sliders?.style_weight ? Math.round(metadata.control_sliders.style_weight * 100) : 50,
                    lyricsWithTags: prompt,
                    // Strip meta tags (anything in []) for the clean lyrics version
                    lyricsAlone: prompt.replace(/\[[\s\S]*?\]/g, "").trim(),
                    javascriptCode: '',
                    fullResponse: ''
                };

                return {
                    id: clip.id,
                    title: title,
                    created_at: clip.created_at,
                    model_name: clip.model_name || 'unknown',
                    imageUrl: clip.image_url,
                    imageLargeUrl: clip.image_large_url,
                    metadata: {
                        tags: tags,
                        prompt: prompt
                    },
                    originalData: originalData
                };
            });

            setHistory(prevHistory => {
                // Merge strategies:
                // 1. Keep all local drafts (ids starting with 'draft_')
                // 2. Add new clips from Suno if they don't exist in local history
                // 3. Update existing Suno clips in local history with fresh data (e.g. status, image url)
                // 4. PRESERVE rich originalData if existing clip was generated by Architect
                
                const existingMap = new Map(prevHistory.map(item => [item.id, item]));
                
                newClips.forEach(newClip => {
                    if (existingMap.has(newClip.id)) {
                        const existing = existingMap.get(newClip.id)!;
                        // Check if existing item has "Rich" data (fullResponse present)
                        const isExistingRich = !!existing.originalData?.fullResponse;
                        
                        const mergedClip: SunoClip = {
                            ...newClip,
                            // If we have rich data locally, keep it. Otherwise use the API data.
                            originalData: isExistingRich ? existing.originalData : newClip.originalData,
                            metadata: isExistingRich ? existing.metadata : newClip.metadata,
                            
                            // Preserve local enhancements
                            alignmentData: existing.alignmentData || newClip.alignmentData,
                            lrcContent: existing.lrcContent || newClip.lrcContent,
                            srtContent: existing.srtContent || newClip.srtContent,
                        };
                        existingMap.set(newClip.id, mergedClip);
                    } else {
                        existingMap.set(newClip.id, newClip);
                    }
                });

                // Convert back to array and sort by date descending
                const merged = Array.from(existingMap.values()).sort((a, b) => 
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
                
                return merged;
            });
        }
    } catch (e) {
        console.error("Failed to fetch history feed", e);
    }
  };

  const handleRefreshHistory = async () => {
    if (!sunoCookie) {
         alert("Please connect your Suno account in Settings first.");
         return;
    }
    setIsSyncingHistory(true);
    try {
        const feedData = await getSunoFeed(sunoCookie);
        if (feedData && Array.isArray(feedData.clips)) {
            // Map new clips
            const newClips: SunoClip[] = feedData.clips.map((clip: any) => {
                const metadata = clip.metadata || {};
                const tags = metadata.tags || '';
                const prompt = metadata.prompt || '';
                const title = clip.title || 'Untitled';
                
                const originalData: ParsedSunoOutput = {
                    style: tags,
                    title: title,
                    excludeStyles: metadata.negative_tags || '',
                    advancedParams: '', 
                    vocalGender: '', 
                    weirdness: metadata.control_sliders?.weirdness_constraint ? Math.round(metadata.control_sliders.weirdness_constraint * 100) : 50,
                    styleInfluence: metadata.control_sliders?.style_weight ? Math.round(metadata.control_sliders.style_weight * 100) : 50,
                    lyricsWithTags: prompt,
                    // Strip meta tags (anything in []) for the clean lyrics version
                    lyricsAlone: prompt.replace(/\[[\s\S]*?\]/g, "").trim(),
                    javascriptCode: '',
                    fullResponse: ''
                };

                return {
                    id: clip.id,
                    title: title,
                    created_at: clip.created_at,
                    model_name: clip.model_name || 'unknown',
                    imageUrl: clip.image_url,
                    imageLargeUrl: clip.image_large_url,
                    metadata: {
                        tags: tags,
                        prompt: prompt
                    },
                    originalData: originalData
                };
            });

            setHistory(prev => {
                // 1. Remove Drafts
                const nonDrafts = prev.filter(p => !p.id.startsWith('draft_'));
                const map = new Map(nonDrafts.map(c => [c.id, c]));

                // 2. Merge New Clips (preserving local rich data)
                newClips.forEach(newClip => {
                    if (map.has(newClip.id)) {
                         const existing = map.get(newClip.id)!;
                         // Check if existing item has "Rich" data (fullResponse present)
                         const isRich = !!existing.originalData?.fullResponse;
                         
                         map.set(newClip.id, {
                             ...newClip,
                             originalData: isRich ? existing.originalData : newClip.originalData,
                             metadata: isRich ? existing.metadata : newClip.metadata,
                             // Preserve local enhancements
                             alignmentData: existing.alignmentData || newClip.alignmentData,
                             lrcContent: existing.lrcContent || newClip.lrcContent,
                             srtContent: existing.srtContent || newClip.srtContent,
                         });
                    } else {
                        map.set(newClip.id, newClip);
                    }
                });

                return Array.from(map.values()).sort((a, b) => 
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
            });
        }
    } catch(e) {
        console.error("Sync failed", e);
    } finally {
        setIsSyncingHistory(false);
    }
  };

  const handleSaveSunoConfig = (cookie: string, model: string, newSettings: PromptSettings) => {
    setSunoCookie(cookie);
    setSunoModel(model);
    setPromptSettings(newSettings);

    if (cookie) {
      localStorage.setItem('suno_cookie', cookie);
      // Refresh credits when saved
      getSunoCredits(cookie).then(setSunoCredits).catch(() => setSunoCredits(null));
      // Refresh history
      historyFetchedRef.current = true; // reset logic not strictly needed here but useful if we wanted to enforce single fetch logic
      fetchAndMergeSunoHistory(cookie);
    } else {
      localStorage.removeItem('suno_cookie');
      setSunoCredits(null);
    }

    if (model) {
       localStorage.setItem('suno_model', model);
    }
  };

  const handleModelChange = (model: string) => {
      setSunoModel(model);
      localStorage.setItem('suno_model', model);
  };

  const handleSyncSuccess = async (response: any, originalData: ParsedSunoOutput) => {
    // 1. Refresh Credits
    if (sunoCookie) {
        getSunoCredits(sunoCookie).then(setSunoCredits).catch(console.error);
    }

    // 2. Update Metadata and History
    if (response && response.clips && Array.isArray(response.clips)) {
        // Trigger metadata updates asynchronously for each clip
        response.clips.forEach((clip: any) => {
             updateSunoMetadata(clip.id, originalData, sunoCookie)
                .then(() => console.log(`Metadata updated for ${clip.id}`))
                .catch(err => console.error(`Metadata update failed for ${clip.id}`, err));
        });

        const newClips: SunoClip[] = response.clips.map((clip: any) => ({
            id: clip.id,
            title: clip.title || 'Untitled',
            created_at: clip.created_at,
            model_name: clip.model_name,
            imageUrl: clip.image_url, // Store image URL if returned
            imageLargeUrl: clip.image_large_url,
            metadata: {
                tags: clip.metadata?.tags || '',
                prompt: clip.metadata?.prompt || ''
            },
            originalData: originalData
        }));
        
        // Add new clips to the beginning of the history
        setHistory(prevHistory => [...newClips, ...prevHistory]);
    }
  };

  const handleGenerate = async (prompt: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null, result: null }));
    try {
      // Create provider config with API key override if provided (for backward compatibility)
      // Only override if customApiKey is actually set (not empty string)
      const config: AIProviderConfig = {
        ...providerConfig,
        apiKey: customApiKey ? customApiKey : providerConfig.apiKey,
        model: providerConfig.model || geminiModel, // Fallback to legacy geminiModel
      };
      
      // Validate config before generating
      if (!validateProviderConfig(config)) {
        throw new Error(`Invalid ${config.type} configuration. Please check your API key and settings.`);
      }
      
      const result = await generateSunoPrompt(prompt, config, promptSettings.customSystemPrompt);
      setState({ isLoading: false, error: null, result });
      
      // Auto-save to history as draft
      const draftClip: SunoClip = {
          id: `draft_${Date.now()}`,
          title: result.title || 'Untitled Prompt',
          created_at: new Date().toISOString(),
          model_name: 'Gemini Draft',
          metadata: {
              tags: result.style || '',
              prompt: result.lyricsWithTags || ''
          },
          originalData: result
      };
      setHistory(prev => [draftClip, ...prev]);

    } catch (err: any) {
      setState({
        isLoading: false,
        error: err.message || "Something went wrong.",
        result: null,
      });
    }
  };

  const handleUpdateClip = (id: string, updates: Partial<SunoClip>) => {
    setHistory(prev => prev.map(clip => clip.id === id ? { ...clip, ...updates } : clip));
  };

  // Helper to render content based on view
  const renderContent = () => {
      switch(view) {
          case 'history':
              return (
                <HistorySection 
                    history={history} 
                    onUpdateClip={handleUpdateClip} 
                    sunoCookie={sunoCookie}
                    onResync={handleRefreshHistory}
                    isSyncing={isSyncingHistory}
                />
              );
          case 'visualizer':
              return (
                  <VisualizerSection 
                    history={history}
                    sunoCookie={sunoCookie}
                    onUpdateClip={handleUpdateClip}
                    providerConfig={providerConfig}
                  />
              );
          case 'generator':
          default:
              return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="lg:col-span-5 space-y-6">
                        <div className="sticky top-24">
                        <div className="mb-6">
                            <h2 className="text-3xl font-bold text-white mb-2">Create Professional Songs</h2>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Transform your raw ideas into structured, high-quality prompts optimized for Suno AI & Udio. 
                                Includes meta tags, song structure, and production directives.
                            </p>
                        </div>
                        <InputSection 
                            onGenerate={handleGenerate} 
                            isLoading={state.isLoading} 
                            apiKeyValid={isKeyValid}
                            providerConfig={providerConfig}
                            onProviderConfigChange={setProviderConfig}
                            onOpenProviderSettings={() => setIsProviderModalOpen(true)}
                        />
                        {state.error && (
                            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                            <strong>Error:</strong> {state.error}
                            </div>
                        )}
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
                    <div className="lg:col-span-7">
                        {state.result ? (
                        <OutputSection 
                            data={state.result} 
                            sunoCookie={sunoCookie}
                            sunoModel={sunoModel}
                            onSyncSuccess={handleSyncSuccess}
                        />
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
              );
      }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-[#0f172a] to-black text-slate-200 font-sans selection:bg-purple-500/30">
      
      <Header 
        onKeyUpdate={setCustomApiKey} 
        onValidationChange={setIsKeyValid}
        onOpenSunoSettings={() => setIsSunoModalOpen(true)}
        onOpenProviderSettings={() => setIsProviderModalOpen(true)}
        sunoCredits={sunoCredits}
        sunoModel={sunoModel}
        onModelChange={handleModelChange}
        geminiModel={geminiModel}
        onGeminiModelChange={handleGeminiModelChange}
        providerConfig={providerConfig}
      />

      <SunoSettingsModal 
        isOpen={isSunoModalOpen}
        onClose={() => setIsSunoModalOpen(false)}
        onSave={handleSaveSunoConfig}
        initialCookie={sunoCookie}
        initialModel={sunoModel}
        initialPromptSettings={promptSettings}
        currentCredits={sunoCredits}
      />

      <ProviderSettingsModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        onSave={(config) => {
          // Load saved OpenAPI settings when switching to OpenAPI
          if (config.type === 'openapi') {
            try {
              const savedOpenApi = localStorage.getItem('ai_provider_openapi_settings');
              if (savedOpenApi) {
                const parsed = JSON.parse(savedOpenApi);
                // Merge saved settings with current config, prioritizing current config
                config = {
                  ...config,
                  baseUrl: config.baseUrl || parsed.baseUrl,
                  authHeader: config.authHeader || parsed.authHeader,
                  authPrefix: config.authPrefix !== undefined ? config.authPrefix : parsed.authPrefix,
                };
              }
            } catch (e) {
              console.warn("Failed to load saved OpenAPI settings", e);
            }
          }
          
          setProviderConfig(config);
          // Update legacy geminiModel if switching to/from Gemini
          if (config.type === 'gemini' && config.model) {
            setGeminiModel(config.model);
          }
        }}
        initialConfig={providerConfig}
      />

      {/* View Switcher */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 w-full flex justify-center">
          <div className="bg-slate-800/50 p-1 rounded-xl flex space-x-1 border border-slate-700/50 backdrop-blur-sm">
             <button
                onClick={() => setView('generator')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    view === 'generator' 
                    ? 'bg-slate-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
             >
                Generator
             </button>
             <button
                onClick={() => setView('history')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    view === 'history' 
                    ? 'bg-slate-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
             >
                <span>History</span>
                {history.length > 0 && (
                    <span className="bg-purple-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {history.length}
                    </span>
                )}
             </button>
             <button
                onClick={() => setView('visualizer')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                    view === 'visualizer' 
                    ? 'bg-slate-700 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
             >
                 {/* Video Camera Icon */}
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <span>Visualizer</span>
             </button>
          </div>
      </div>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {renderContent()}
      </main>
      <Footer git="https://github.com/xiliourt/Suno-Architect/" />
    </div>
  );
};

export default App;
