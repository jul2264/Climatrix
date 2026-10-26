import React from 'react';
import { Award, AlertOctagon } from 'lucide-react';

interface ExplanationBannerProps {
  recommendedRouteId: string | null;
  explanation: string;
}

export const ExplanationBanner: React.FC<ExplanationBannerProps> = ({
  recommendedRouteId,
  explanation,
}) => {
  if (!explanation) return null;

  const isSafe = recommendedRouteId !== null;

  return (
    <div
      className={`glass-panel explanation-banner ${isSafe ? 'safe' : 'hazard'}`}
      style={{
        padding: '14px 16px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-subtle)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div style={{ marginTop: '1px', flexShrink: 0 }}>
        {isSafe ? (
          <Award size={18} color="var(--color-terminal-green)" />
        ) : (
          <AlertOctagon size={18} color="#d32f2f" />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              fontSize: '11px',
              letterSpacing: '0.071em',
              textTransform: 'uppercase',
              color: isSafe ? 'var(--color-terminal-green)' : '#d32f2f',
            }}
          >
            {isSafe ? `RECOMMENDED — ${recommendedRouteId}` : 'SEVERE WEATHER HAZARD ALERT'}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            fontWeight: 400,
            margin: 0,
          }}
        >
          {explanation}
        </p>
      </div>
    </div>
  );
};
