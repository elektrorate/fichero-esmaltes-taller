/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Commit con el que se compiló la app, inyectado por vite.config.ts. */
declare const __BUILD_SHA__: string;