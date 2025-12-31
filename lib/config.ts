export const DEFAULT_LLM_PORT = 11434;
export const DEFAULT_BACKEND_PORT = 8000;

export const getBaseUrl = (port: number) => {
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${port}`;
  }
  return `http://localhost:${port}`;
};

export const LLM_URL = getBaseUrl(process.env.NEXT_PUBLIC_LLM_PORT ? parseInt(process.env.NEXT_PUBLIC_LLM_PORT) : DEFAULT_LLM_PORT);
export const BACKEND_URL = getBaseUrl(process.env.NEXT_PUBLIC_BACKEND_PORT ? parseInt(process.env.NEXT_PUBLIC_BACKEND_PORT) : DEFAULT_BACKEND_PORT);
