import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
          react(),
          tailwindcss(),
      ], 
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY),
        'import.meta.env.VITE_OPENAPI_API_KEY': JSON.stringify(env.OPENAPI_API_KEY),
        'import.meta.env.VITE_OPENAPI_BASE_URL': JSON.stringify(env.OPENAPI_BASE_URL),
        'import.meta.env.VITE_AI_PROVIDER_TYPE': JSON.stringify(env.AI_PROVIDER_TYPE),
        'import.meta.env.VITE_AI_PROVIDER_MODEL': JSON.stringify(env.AI_PROVIDER_MODEL),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
