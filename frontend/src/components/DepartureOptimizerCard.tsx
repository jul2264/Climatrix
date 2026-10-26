import React, { useState } from 'react';
import type { DepartureCandidate, DepartureOptimization } from '../types';
import { getRiskStyle } from '../utils/palette';
import { ArrowRight, Calendar, Sparkles, X } from 'lucide-react';

interface DepartureOptimizerCardProps {
  optimization: DepartureOptimization;
  onApplyDeparture: (newDepartureIso: string) => void;
  initialShowPopup?: boolean;
}

export const DepartureOptimizerCard: React.FC<DepartureOptimizerCardProps> = ({
  optimization,
  onApplyDeparture,
  initialShowPopup = false,
}) => {
  const [showWindows, setShowWindows] = useState<boolean>(initialShowPopup);
  const [selectedCandidate, setSelectedCandidate] = useState<DepartureCandidate>(
    optimization.candidates.find((c) => c.offset_hours === optimization.recommended_offset_hours) ||
      optimization.candidates[0]
  );

  const isShiftRecommended = optimization.recommended_offset_hours !== 0;

  const optTimeFormatted = new Date(optimization.recommended_departure).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      className="glass-panel"
      style={{
        padding: '16px',
        marginBottom: '12px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Header spanning the top of the box */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
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
            DEPARTURE WINDOW OPTIMIZER
          </span>
        </div>

        {isShiftRecommended && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--color-terminal-green)',
              backgroundColor: 'transparent',
              border: '1px solid var(--color-hairline)',
              padding: '2px 8px',
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
            }}
          >
            +{optimization.recommended_offset_hours}H SHIFT RECOMMENDED
          </span>
        )}
      </div>

      {/* Explanation Banner */}
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          lineHeight: '1.5',
          margin: '0 0 12px 0',
        }}
      >
        {optimization.explanation}
      </p>

      {/* Metrics Delta Box (if shift beneficial) */}
      {isShiftRecommended && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-paper-white)',
            border: '1px solid var(--color-hairline)',
            marginBottom: '12px',
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Severe Avoided
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-terminal-green)',
              }}
            >
              {optimization.severe_miles_eliminated > 0
                ? `${optimization.severe_miles_eliminated.toFixed(1)} mi eliminated`
                : 'Corridor hazards bypassed'}
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--color-hairline)' }} />

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Optimal Departure
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {optTimeFormatted}
            </div>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => onApplyDeparture(optimization.recommended_departure)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Apply Shift
            <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Departure Windows Action Button */}
      <button
        type="button"
        id="departure-windows-btn"
        className="departure-windows-btn predict-risk-btn btn-secondary"
        onClick={() => setShowWindows((prev) => !prev)}
        aria-expanded={showWindows}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 14px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontFamily: 'var(--font-sans)',
          fontWeight: 400,
          background: showWindows ? 'var(--color-paper-white)' : 'transparent',
          border: '1px solid var(--border-subtle)',
          boxShadow: showWindows ? 'var(--shadow-subtle)' : undefined,
          color: 'var(--text-primary)',
        }}
      >
        <Calendar size={14} color="var(--text-muted)" />
        <span>Departure Windows</span>
      </button>

      {/* Inbuilt Feature Below the Button: Rounded Container */}
      {showWindows && (
        <div
          className="departure-windows-inbuilt"
          style={{
            marginTop: '10px',
            padding: '12px',
            background: 'var(--color-paper-white)',
            border: '1px solid var(--color-hairline)',
            borderRadius: '6px',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              paddingBottom: '6px',
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
                DEPARTURE WINDOWS
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                }}
              >
                (-4H TO +12H)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowWindows(false)}
              aria-label="Close departure windows"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Grid Format of Dates/Windows */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '2px',
              scrollbarWidth: 'thin',
            }}
          >
            {optimization.candidates
              .filter((cand) => cand.offset_hours !== 0)
              .map((cand) => {
                const isSelected = cand.offset_hours === selectedCandidate.offset_hours;
                const isRecommended = cand.offset_hours === optimization.recommended_offset_hours;
                const riskStyle = getRiskStyle(cand.max_level);

                const timeLabel = new Date(cand.departure_iso).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                });
                const offsetLabel =
                  cand.offset_hours > 0 ? `+${cand.offset_hours}h` : `${cand.offset_hours}h`;

                return (
                  <button
                    key={cand.offset_hours}
                    type="button"
                    onClick={() => {
                      setSelectedCandidate(cand);
                      onApplyDeparture(cand.departure_iso);
                      setShowWindows(false);
                    }}
                    title={`Select ${offsetLabel} (${timeLabel}) with ${cand.max_level} risk`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 4px',
                      borderRadius: '6px',
                      border: isSelected
                        ? '1px solid var(--color-obsidian)'
                        : isRecommended
                        ? '1px solid var(--color-terminal-green)'
                        : '1px solid var(--color-hairline)',
                      background: isSelected
                        ? 'var(--color-obsidian)'
                        : 'var(--color-pure-white)',
                      color: isSelected ? 'var(--color-pure-white)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {/* Top: +/- hrs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: isSelected
                            ? 'var(--color-pure-white)'
                            : isRecommended
                            ? 'var(--color-terminal-green)'
                            : 'var(--text-primary)',
                        }}
                      >
                        {offsetLabel}
                      </span>
                      {isRecommended && !isSelected && (
                        <Sparkles size={8} color="var(--color-terminal-green)" />
                      )}
                    </div>

                    {/* Middle: Time */}
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '11px',
                        color: isSelected ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)',
                        margin: '2px 0',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {timeLabel}
                    </span>

                    {/* Bottom: Risk level indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: riskStyle.color,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          fontWeight: 600,
                          color: isSelected ? 'rgba(255,255,255,0.9)' : riskStyle.color,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {cand.max_level === 'NO_TRAVEL' ? 'NO TRV' : cand.max_level}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
