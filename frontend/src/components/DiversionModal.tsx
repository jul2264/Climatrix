import React from 'react';
import type { SentinelAssessment } from '../types';
import { AlertOctagon, CheckCircle2, ShieldAlert, X } from 'lucide-react';

interface DiversionModalProps {
  assessment: SentinelAssessment;
  onDismiss: () => void;
  onConfirmHaven: () => void;
}

export const DiversionModal: React.FC<DiversionModalProps> = ({
  assessment,
  onDismiss,
  onConfirmHaven,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: '24px',
          borderRadius: '6px',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-subtle), 0 16px 40px rgba(0, 0, 0, 0.2)',
          background: 'var(--bg-surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertOctagon size={20} color="#d32f2f" />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.071em',
                textTransform: 'uppercase',
                color: 'var(--text-primary)',
              }}
            >
              SENTINEL EMERGENCY DIVERSION
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Hazard Callout */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-paper-white)',
            border: '1px solid var(--color-hairline)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#d32f2f',
              marginBottom: '4px',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <ShieldAlert size={14} color="#d32f2f" />
            <span>Hazard Onset Ahead at Mile {assessment.hazard_mile}</span>
          </div>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)' }}>
            {assessment.explanation}
          </p>
        </div>

        {/* Time to Hazard Details */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--color-paper-white)',
            border: '1px solid var(--color-hairline)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            TIME TO HAZARD:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              ~{assessment.time_to_hazard_min} MIN
            </strong>
          </span>
          <span>
            DISTANCE:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {(assessment.hazard_mile ? assessment.hazard_mile - assessment.current_mile : 0).toFixed(1)} MI
            </strong>
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirmHaven}
            style={{
              flex: 1,
              borderRadius: '6px',
              padding: '9px 14px',
              fontWeight: 500,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={15} />
            Acknowledge & Seek Safe Haven
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={onDismiss}
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              borderRadius: '6px',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
