const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

export const API_BASE = (configuredApiBase || 'https://smart-operator-assistant.onrender.com').replace(/\/$/, '');
