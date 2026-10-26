import React from 'react';
import { Award, Check, Clock, Navigation, ShieldAlert } from 'lucide-react';
import type { RouteAnalysis } from '../types';
import { formatDuration, formatNumber } from '../utils/formatters';
import { getRiskStyle } from '../utils/palette';

interface RouteCardProps {
  route: RouteAnalysis;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}

/** Memoized RouteCard — only re-renders when its own route, selection or
 *  recommendation status changes, not on any other parent state update. */
const RouteCardInner: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  isRecommended,
  onSelect,
}) => {
  const { summary } = route;
  const maxRiskStyle = getRiskStyle(summary.max_level);
  const isNoTravel = summary.no_travel_miles > 0 || summary.max_level === 'NO_TRAVEL';
  // CSS class name for risk badge — avoids inline style recalc per render
  const riskBadgeClass = `risk-badge risk-badge-${summary.max_level.toLowerCase().replace('_', '-')}`;

  return (
    <div
      onClick={onSelect}
      className={`glass-card route-card ${isSelected ? 'selected' : ''} ${
        isRecommended ? 'recommended' : ''
      } ${isNoTravel ? 'no-travel' : ''}`}
      style={{
        padding: '16px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        // Transform for selection highlight — stays off layout critical path
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        transform: isSelected ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Badges Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '1.08rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '0.01em',
            }}
          >
            {route.id}
          </span>

          {isSelected && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.071em',
                textTransform: 'uppercase',
                background: 'var(--color-obsidian)',
                color: 'var(--color-pure-white)',
              }}
            >
              <Check size={11} /> ACTIVE
            </span>
          )}

          {isRecommended && (
            <span
              className="recommended-badge"
              title="Recommended Route"
              aria-label="Recommended Route"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.071em',
                textTransform: 'uppercase',
                background: 'rgba(41,122,58,0.1)',
                color: 'var(--color-terminal-green)',
                boxShadow: '0 0 0 1px rgba(41,122,58,0.3)',
              }}
            >
              <Award size={11} /> BEST
            </span>
          )}

          {isNoTravel && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.071em',
                textTransform: 'uppercase',
                background: 'rgba(185,28,28,0.08)',
                color: '#991b1b',
                boxShadow: '0 0 0 1px rgba(185,28,28,0.25)',
              }}
            >
              <ShieldAlert size={11} />
              NOT DRIVABLE
            </span>
          )}
        </div>

        {/* Max Risk Pill — CSS class name, no inline style recalc */}
        <span className={riskBadgeClass}>{maxRiskStyle.label}</span>
      </div>

      {/* Main Metrics: Distance & Duration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Navigation size={14} color="var(--text-muted)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{formatNumber(route.distance_mi)} miles</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <Clock size={14} color="var(--text-muted)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{formatDuration(route.duration_min)}</span>
        </div>
      </div>

      {/* Weather Risk Exposure Box */}
      <div className="route-metrics-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Severe</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: summary.severe_miles > 0 ? '#be123c' : 'var(--color-terminal-green)' }}>
            {summary.severe_miles} mi
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>High Risk</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: summary.high_miles > 0 ? '#92400e' : 'var(--text-muted)' }}>
            {summary.high_miles} mi
          </span>
        </div>

        {summary.no_travel_miles > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#991b1b', fontWeight: 500 }}>
            <span>No Travel</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{summary.no_travel_miles} mi</span>
          </div>
        )}

        {summary.avg_risk !== null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px', borderTop: '1px solid var(--color-hairline)', paddingTop: '4px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Avg Risk</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{summary.avg_risk.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const RouteCard = React.memo(RouteCardInner);
