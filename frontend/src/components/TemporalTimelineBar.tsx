import React from 'react';
import type { DepartureCandidate } from '../types';
import { getRiskStyle } from '../utils/palette';
import { Sparkles } from 'lucide-react';

interface TemporalTimelineBarProps {
  candidates: DepartureCandidate[];
  recommendedOffsetHours: number;
  currentOffsetHours: number;
  onSelectCandidate: (candidate: DepartureCandidate) => void;
}

export const TemporalTimelineBar: React.FC<TemporalTimelineBarProps> = ({
  candidates,
  recommendedOffsetHours,
  currentOffsetHours,
  onSelectCandidate,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600 }}>
          Departure Risk Spectrum (-4h to +12h)
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'thin',
        }}
      >
        {candidates.map((c) => {
          const isSelected = c.offset_hours === currentOffsetHours;
          const isRecommended = c.offset_hours === recommendedOffsetHours;
          const riskStyle = getRiskStyle(c.max_level);

          const dt = new Date(c.departure_iso);
          const timeLabel = dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const offsetLabel =
            c.offset_hours === 0 ? 'Now' : c.offset_hours > 0 ? `+${c.offset_hours}h` : `${c.offset_hours}h`;

          return (
            <button
              key={c.offset_hours}
              type="button"
              onClick={() => onSelectCandidate(c)}
              title={`${offsetLabel} (${timeLabel}): ${c.max_level} risk, Severe: ${c.severe_miles} mi, No Travel: ${c.no_travel_miles} mi`}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: '8px',
                minWidth: '56px',
                border: isSelected
                  ? '2px solid #3b82f6'
                  : isRecommended
                  ? '2px solid #10b981'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: isSelected
                  ? 'rgba(59, 130, 246, 0.2)'
                  : isRecommended
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(30, 41, 59, 0.5)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              {isRecommended && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-4px',
                    background: '#10b981',
                    color: '#ffffff',
                    borderRadius: '50%',
                    width: '14px',
                    height: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Optimal Departure Window"
                >
                  <Sparkles size={8} />
                </div>
              )}

              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: isSelected || isRecommended ? 700 : 500,
                  color: isSelected ? '#60a5fa' : isRecommended ? '#34d399' : '#f8fafc',
                }}
              >
                {offsetLabel}
              </span>

              <span style={{ fontSize: '0.66rem', color: '#94a3b8', margin: '2px 0 4px 0' }}>
                {timeLabel}
              </span>

              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: riskStyle.color,
                  boxShadow: `0 0 6px ${riskStyle.color}88`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
