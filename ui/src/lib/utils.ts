import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Provider color mapping
export const PROVIDER_COLORS: Record<string, string> = {
  agy: '#f3722c',
  gemini: '#277da1',
  codex: '#f8961e',
  qwen: '#f9c74f',
  kiro: '#4d908e',
  iflow: '#f94144',
  ghcp: '#43aa8b',
};

export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] || '#577590';
}

