import type { RiskLevel } from '../types';

export interface RiskStyle {
  label: string;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export const RISK_PALETTE: Record<RiskLevel, RiskStyle> = {
  LOW: {
    label: 'Low Risk',
    color: '#10b981', // Emerald
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.4)',
    text: '#059669',
  },
  MODERATE: {
    label: 'Moderate Risk',
    color: '#3b82f6', // Accessible Blue
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.4)',
    text: '#2563eb',
  },
  HIGH: {
    label: 'High Risk',
    color: '#f59e0b', // Amber / Gold
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.4)',
    text: '#d97706',
  },
  SEVERE: {
    label: 'Severe Risk',
    color: '#ec4899', // Vivid Magenta / Deep Rose for color-blind distinction
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.4)',
    text: '#db2777',
  },
  NO_TRAVEL: {
    label: 'No Travel Hazard',
    color: '#ef4444', // Red Alert
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.5)',
    text: '#dc2626',
  },
  UNKNOWN: {
    label: 'Unknown Risk',
    color: '#94a3b8', // Slate
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.4)',
    text: '#64748b',
  },
};

export function getRiskStyle(level: RiskLevel | string): RiskStyle {
  const norm = (level || 'UNKNOWN').toUpperCase() as RiskLevel;
  return RISK_PALETTE[norm] || RISK_PALETTE.UNKNOWN;
}

export function getNumericRiskColor(riskVal: number): string {
  switch (riskVal) {
    case 0:
      return RISK_PALETTE.LOW.color;
    case 1:
      return RISK_PALETTE.MODERATE.color;
    case 2:
      return RISK_PALETTE.HIGH.color;
    case 3:
      return RISK_PALETTE.SEVERE.color;
    case 4:
      return RISK_PALETTE.NO_TRAVEL.color;
    default:
      return RISK_PALETTE.UNKNOWN.color;
  }
}
