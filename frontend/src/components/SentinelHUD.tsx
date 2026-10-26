import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RouteAnalysis, SentinelAssessment, SentinelStatus } from '../types';
import { sendSentinelTelemetry, startSentinelTrip } from '../api/client';
import { Activity, AlertTriangle, Navigation, Pause, Play, ShieldAlert } from 'lucide-react';

interface SentinelHUDProps {
  activeRoute: RouteAnalysis | null;
  loadLb: number;
  departureIso: string;
  onEmergencyDivert?: (assessment: SentinelAssessment) => void;
}

export const SentinelHUD: React.FC<SentinelHUDProps> = ({
  activeRoute,
  loadLb,
  departureIso,
  onEmergencyDivert,
}) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isDriving, setIsDriving] = useState(false);
  const [currentMile, setCurrentMile] = useState(0);
  const [assessment, setAssessment] = useState<SentinelAssessment | null>(null);
  const [tripId] = useState(() => `trip_${Date.now()}`);

  const totalMiles = activeRoute?.distance_mi || 100;

  // Initialize trip with Sentinel backend on activate
  useEffect(() => {
    if (!isMonitoring || !activeRoute) return;

    startSentinelTrip({
      trip_id: tripId,
      origin: 'Trip Origin',
      destination: 'Trip Destination',
      load_lb: loadLb,
      departure: departureIso,
      route_geometry: activeRoute.geometry,
      checkpoints: activeRoute.checkpoints,
    }).catch(() => {
      // Handled silently
    });
  }, [isMonitoring, activeRoute, tripId, loadLb, departureIso]);

  // Telemetry ping helper
  const pingTelemetry = useCallback(
    async (mile: number) => {
      if (!isMonitoring || !activeRoute) return;
      try {
        const res = await sendSentinelTelemetry(tripId, mile);
        setAssessment(res);
        if (res.status === 'EMERGENCY' && onEmergencyDivert) {
          onEmergencyDivert(res);
        }
      } catch {
        // Telemetry fallback
      }
    },
    [isMonitoring, activeRoute, tripId, onEmergencyDivert]
  );

  // Debounced slider move
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMileChange = (val: number) => {
    setCurrentMile(val);
    if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
    pingTimeoutRef.current = setTimeout(() => {
      pingTelemetry(val);
    }, 150);
  };

  // Simulated en-route driving ticker (advances 5 miles every second)
  useEffect(() => {
    if (!isDriving || !isMonitoring) return;
    const interval = setInterval(() => {
      setCurrentMile((prev) => {
        const next = Math.min(totalMiles, prev + 5);
        pingTelemetry(next);
        if (next >= totalMiles) {
          setIsDriving(false);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDriving, isMonitoring, totalMiles, pingTelemetry]);

  if (!activeRoute) return null;

  const status: SentinelStatus = assessment?.status || 'NOMINAL';

  const statusBadgeColor =
    status === 'EMERGENCY'
      ? '#ef4444'
      : status === 'ADVISORY'
      ? '#f59e0b'
      : '#10b981';

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 20,
        width: '320px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        border: `1px solid ${statusBadgeColor}44`,
        boxShadow: `0 4px 20px ${statusBadgeColor}22`,
      }}
    >
      {/* Header and Radar Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: statusBadgeColor,
              boxShadow: `0 0 10px ${statusBadgeColor}`,
              animation: isMonitoring ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
            Corridor Sentinel
          </span>
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '4px',
              backgroundColor: `${statusBadgeColor}22`,
              color: statusBadgeColor,
            }}
          >
            {status}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = !isMonitoring;
            setIsMonitoring(next);
            if (!next) {
              setIsDriving(false);
              setAssessment(null);
            } else {
              pingTelemetry(currentMile);
            }
          }}
          style={{
            fontSize: '0.72rem',
            padding: '3px 8px',
            borderRadius: '4px',
            border: isMonitoring ? '1px solid #10b981' : '1px solid #475569',
            background: isMonitoring ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
            color: isMonitoring ? '#34d399' : '#94a3b8',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isMonitoring ? 'Active' : 'Enable'}
        </button>
      </div>

      {isMonitoring ? (
        <>
          {/* Status readout */}
          <div style={{ fontSize: '0.76rem', color: '#cbd5e1', lineHeight: '1.4' }}>
            {assessment ? assessment.explanation : 'Sentinel agent monitoring active trip corridor...'}
          </div>

          {/* Hazard Countdown if any */}
          {assessment && assessment.hazard_mile !== null && assessment.time_to_hazard_min !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: status === 'EMERGENCY' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: status === 'EMERGENCY' ? '#fca5a5' : '#fcd34d',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {status === 'EMERGENCY' ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
              <span>
                Hazard at Mile {assessment.hazard_mile} • Est. in ~{assessment.time_to_hazard_min} min
              </span>
            </div>
          )}

          {/* Odometer Simulator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Navigation size={12} color="#60a5fa" />
                Truck Position: <strong>{currentMile.toFixed(0)} mi</strong>
              </span>
              <span>{Math.max(0, totalMiles - currentMile).toFixed(0)} mi left</span>
            </div>

            <input
              type="range"
              min="0"
              max={totalMiles}
              value={currentMile}
              onChange={(e) => handleMileChange(parseFloat(e.target.value))}
              style={{
                width: '100%',
                height: '4px',
                appearance: 'none',
                background: '#3b82f6',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Drive Simulator Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setIsDriving((d) => !d)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: isDriving ? 'rgba(59, 130, 246, 0.3)' : 'rgba(30, 41, 59, 0.5)',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              {isDriving ? <Pause size={12} /> : <Play size={12} />}
              {isDriving ? 'Pause Trip' : 'Simulate Driving'}
            </button>

            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
              Telemetry: 30s Heartbeat
            </span>
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={13} />
          <span>Enable Sentinel to track vehicle in-flight</span>
        </div>
      )}
    </div>
  );
};
