import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';

interface ForecastSliderProps {
  currentHour: number;
  onHourChange: (hour: number) => void;
  departureTimeIso?: string;
  debounceMs?: number;
}

/** How long to debounce slider input before propagating to heatmap GeoJSON. */
const DEFAULT_DEBOUNCE_MS = 80;

export const ForecastSlider: React.FC<ForecastSliderProps> = ({
  currentHour,
  onHourChange,
  departureTimeIso,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const [prevCurrentHour, setPrevCurrentHour] = useState(currentHour);
  const [displayHour, setDisplayHour] = useState(currentHour);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (prevCurrentHour !== currentHour) {
    setPrevCurrentHour(currentHour);
    setDisplayHour(currentHour);
  }

  // Debounced propagation — avoids GeoJSON rebuild on every pixel of drag
  const propagate = useCallback(
    (h: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (debounceMs <= 0) {
        onHourChange(h);
      } else {
        debounceRef.current = setTimeout(() => {
          onHourChange(h);
        }, debounceMs);
      }
    },
    [onHourChange, debounceMs]
  );

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsPlaying(false);
      const h = parseInt(e.target.value, 10);
      setDisplayHour(h);
      propagate(h);
    },
    [propagate]
  );

  // Auto-play ticker
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setDisplayHour((prev) => {
        const next = prev >= 48 ? 0 : prev + 1;
        propagate(next);
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, propagate]);

  // Cleanup debounce on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setDisplayHour(0);
    onHourChange(0);
  }, [onHourChange]);

  const baseTimestamp = departureTimeIso ? new Date(departureTimeIso).getTime() : 0;

  const forecastTimeString = React.useMemo(() => {
    const target = new Date(baseTimestamp + displayHour * 3600 * 1000);
    return target.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [baseTimestamp, displayHour]);

  return (
    <div
      className="glass-panel forecast-slider-container"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 80,
        width: '92%',
        maxWidth: '760px',
        padding: '12px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-subtle), 0 8px 30px rgba(0, 0, 0, 0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Header and Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} color="var(--text-muted)" />
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
            CORRIDOR FORECAST
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              letterSpacing: '0.05em',
            }}
          >
            +{displayHour}h {displayHour === 0 ? '(NOW)' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            {forecastTimeString}
          </span>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsPlaying((p) => !p)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              gap: '4px',
              height: '28px',
            }}
            title={isPlaying ? 'Pause auto-play' : 'Play 48h sequence'}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleReset}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              height: '28px',
            }}
            title="Reset to Hour 0"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Slider Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontWeight: 400,
            width: '24px',
          }}
        >
          0h
        </span>
        <input
          id="forecast-hour-slider"
          type="range"
          min="0"
          max="48"
          step="1"
          value={displayHour}
          onChange={handleSliderChange}
          style={{
            flex: 1,
            height: '4px',
            appearance: 'none',
            background: 'var(--border-subtle)',
            borderRadius: '2px',
            cursor: 'pointer',
            outline: 'none',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontWeight: 400,
            width: '28px',
            textAlign: 'right',
          }}
        >
          +48h
        </span>
      </div>

      {/* Ticks */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 32px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
        }}
      >
        <span>DEPARTURE</span>
        <span>+12H</span>
        <span>+24H</span>
        <span>+36H</span>
        <span>+48H</span>
      </div>
    </div>
  );
};
