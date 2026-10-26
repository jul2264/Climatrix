import React, { useState, useRef } from 'react';
import type { TripFormData } from '../types';
import { CityAutocomplete } from './CityAutocomplete';
import { DatePicker } from './DatePicker';
import { TimePicker } from './TimePicker';

interface TripFormProps {
  onSubmit: (data: TripFormData) => void;
  isLoading: boolean;
}

function getInitialDate(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return `${month}-${day}-${year}`;
}

function getInitialTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  const hours = String(d.getHours()).padStart(2, '0');
  return `${hours}:00`;
}

export const TripForm: React.FC<TripFormProps> = ({ onSubmit, isLoading }) => {
  const [origin, setOrigin] = useState('Chicago, IL');
  const [destination, setDestination] = useState('Indianapolis, IN');
  const [departureDate, setDepartureDate] = useState(getInitialDate);
  const [departureTime, setDepartureTime] = useState(getInitialTime);
  const [loadLb, setLoadLb] = useState<number>(42000);
  const [intervalMiles, setIntervalMiles] = useState<string>('auto');
  const [error, setError] = useState<string | null>(null);

  const destInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin.trim()) {
      setError('Origin location is required.');
      return;
    }
    if (!destination.trim()) {
      setError('Destination location is required.');
      return;
    }
    if (!loadLb || loadLb <= 0) {
      setError('Load weight must be greater than 0 lbs.');
      return;
    }

    setError(null);

    // Convert US MM-DD-YYYY and HH:mm to ISO 8601 with local timezone offset
    const dateParts = departureDate.split('-').map((p) => parseInt(p, 10));
    const timeParts = departureTime.split(':').map((p) => parseInt(p, 10));

    let dateObj: Date;
    if (dateParts.length === 3 && timeParts.length >= 2) {
      dateObj = new Date(
        dateParts[2], // year
        dateParts[0] - 1, // month 0-indexed
        dateParts[1], // day
        timeParts[0], // hours
        timeParts[1] // minutes
      );
    } else {
      dateObj = new Date();
    }

    const isoWithOffset = dateObj.toISOString();

    const intervalVal =
      intervalMiles === 'auto' ? null : (parseInt(intervalMiles, 10) as 10 | 25 | 50);

    onSubmit({
      origin: origin.trim(),
      destination: destination.trim(),
      departure: isoWithOffset,
      load_lb: loadLb,
      interval_miles: intervalVal,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel"
      style={{ padding: '14px 16px', position: 'relative', zIndex: 40 }}
    >
      {/* Form header — eyebrow + title per DESIGN.md */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={
            { fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 400, letterSpacing: '0.071em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }
          }>
            ▲ Truck Route Safety
          </div>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            Plan Journey
          </h2>
        </div>
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 400, letterSpacing: '0.071em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            padding: '2px 8px', borderRadius: '9999px', boxShadow: '0 0 0 1px var(--color-hairline)' }}
        >
          HGV
        </span>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'rgba(185,28,28,0.06)',
          boxShadow: '0 0 0 1px rgba(185,28,28,0.25)', borderRadius: 'var(--radius-sm)',
          color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* Origin */}
      <CityAutocomplete
        id="origin-input"
        label="Origin"
        icon={<span style={{ color: 'var(--color-terminal-green)', fontSize: 12 }}>●</span>}
        value={origin}
        onChange={setOrigin}
        placeholder="e.g. Chicago, IL"
        required
        onSelectNext={() => destInputRef.current?.focus()}
      />

      {/* Destination */}
      <CityAutocomplete
        ref={destInputRef}
        id="dest-input"
        label="Destination"
        icon={<span style={{ color: '#ef4444', fontSize: 12 }}>●</span>}
        value={destination}
        onChange={setDestination}
        placeholder="e.g. Indianapolis, IN"
        required
      />

      {/* Departure Date & Time - eBay Design System DatePicker + timepicker-ui TimePicker */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '8px' }}>
        <DatePicker
          id="departure-date-input"
          label="Departure Date"
          value={departureDate}
          onChange={setDepartureDate}
          required
        />
        <TimePicker
          id="departure-time-input"
          label="Departure Time"
          value={departureTime}
          onChange={setDepartureTime}
          required
        />
      </div>

      {/* Load Weight */}
      <div className="input-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="input-label" htmlFor="load-input" style={{ marginBottom: 0 }}>
            Load Weight (lbs)
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {([25000, 35000, 45000] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  boxShadow: loadLb === w
                    ? '0 0 0 1px var(--color-obsidian)'
                    : undefined,
                  color: loadLb === w ? 'var(--color-obsidian)' : undefined,
                }}
                aria-label={`${w / 1000}k lb`}
                onClick={() => setLoadLb(w)}
              >
                {w / 1000}k lb
              </button>
            ))}
          </div>
        </div>
        <input
          id="load-input"
          type="number"
          className="text-input"
          min="0"
          step="any"
          value={loadLb}
          onChange={(e) => setLoadLb(Math.max(1, parseInt(e.target.value, 10) || 1))}
          required
        />
      </div>

      {/* Sampling Interval */}
      <div className="input-group">
        <label className="input-label" htmlFor="interval-select">
          Checkpoint Spacing
        </label>
        <select
          id="interval-select"
          className="select-input"
          value={intervalMiles}
          onChange={(e) => setIntervalMiles(e.target.value)}
        >
          <option value="auto">Adaptive</option>
          <option value="10">Every 10 miles (High Density)</option>
          <option value="25">Every 25 miles (Standard)</option>
          <option value="50">Every 50 miles (Long Haul)</option>
        </select>
      </div>

      {/* Action Button */}
      <div style={{ marginTop: '14px' }}>
        <button
          id="submit-trip-btn"
          type="submit"
          className="btn-primary"
          disabled={isLoading}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isLoading ? (
            <>
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(0,0,0,0.2)',
                  borderTopColor: '#000',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Analyzing...
            </>
          ) : (
            '▲ Analyze Route Safety'
          )}
        </button>
      </div>
    </form>
  );
};
