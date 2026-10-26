import React, { useState, useRef, useEffect } from 'react';
import { Info, ChevronDown, ChevronUp, X } from 'lucide-react';
import { RISK_PALETTE } from '../utils/palette';
import type { RiskLevel } from '../types';

export const Legend: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const levels: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL', 'UNKNOWN'];

  // Close legend popup when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 90,
      }}
    >
      {/* Top-Right Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '6px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-subtle)',
          color: 'var(--text-primary)',
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease',
        }}
        title="Toggle Weather Risk Legend"
      >
        <Info size={13} color="var(--text-muted)" />
        <span>Legend</span>
        {isOpen ? <ChevronUp size={13} color="var(--text-muted)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
      </button>

      {/* Bordered Card Popover */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '38px',
            right: '0',
            width: '320px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            boxShadow: 'var(--shadow-subtle), 0 12px 32px rgba(0, 0, 0, 0.08)',
            padding: '14px 16px',
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--color-hairline)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.071em',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                }}
              >
                WEATHER RISK LEGEND
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '4px',
              }}
              title="Close legend"
            >
              <X size={14} />
            </button>
          </div>

          {/* Risk Level Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {levels.map((lvl) => {
              const style = RISK_PALETTE[lvl];
              return (
                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: style.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      color: style.color,
                      width: '90px',
                      fontSize: '11px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {style.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      lineHeight: 1.3,
                    }}
                  >
                    {lvl === 'LOW' && 'Clear / Light conditions'}
                    {lvl === 'MODERATE' && '25–34 mph | 0.10–0.25 in'}
                    {lvl === 'HIGH' && '35–44 mph | 0.25–0.50 in'}
                    {lvl === 'SEVERE' && '45–54 mph or >40k lb'}
                    {lvl === 'NO_TRAVEL' && '≥55 mph or >30k lb'}
                    {lvl === 'UNKNOWN' && 'Uncertain / Missing'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
