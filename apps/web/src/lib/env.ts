// URLs do back (Vite injeta em tempo de build).
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5001').replace(/\/$/, '');
export const WS_URL = (import.meta.env.VITE_WS_URL ?? API_URL).replace(/\/$/, '');
export const API_BASE = `${API_URL}/api`;
