import React, { useState, useEffect } from 'react';
import { Radio, Route as RouteIcon, Navigation, CloudLightning, ShieldAlert } from 'lucide-react';

export interface MapRadarHUDProps {
  origin?: string;
  destination?: string;
  loadLb?: number;
}

interface TelemetryStage {
  title: string;
  detail: string;
  progress: number;
  icon: React.ReactNode;
  tag: string;
}

export const MapRadarHUD: React.FC<MapRadarHUDProps> = ({
  origin,
  destination,
  loadLb = 42000,
}) => {
  const [stageIndex, setStageIndex] = useState(0);

  const stages: TelemetryStage[] = [
    {
      title: 'Locating 3 HGV Highway Corridors',
      detail: 'Querying OpenRouteService heavy-vehicle routing engine...',
      progress: 25,
      icon: <RouteIcon size={16} color="#38bdf8" />,
      tag: 'ORS HGV',
    },
    {
      title: 'Sampling Corridors & Cumulative ETAs',
      detail: 'Generating checkpoints and monotonic arrival times along routes...',
      progress: 52,
      icon: <Navigation size={16} color="#60a5fa" />,
      tag: 'Checkpoints',
    },
    {
      title: 'Streaming Live Doppler & Wind Streams',
      detail: 'Executing parallel multi-point weather queries from Open-Meteo...',
      progress: 78,
      icon: <CloudLightning size={16} color="#38bdf8" />,
      tag: 'Open-Meteo',
    },
    {
      title: `Evaluating Rollover Risk (${(loadLb / 1000).toFixed(0)}k lb load)`,
      detail: 'Applying load-specific severe wind & precipitation risk rules...',
      progress: 94,
      icon: <ShieldAlert size={16} color="#f59e0b" />,
      tag: 'Risk Engine',
    },
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setStageIndex(1), 1100);
    const t2 = setTimeout(() => setStageIndex(2), 2400);
    const t3 = setTimeout(() => setStageIndex(3), 3900);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const currentStage = stages[stageIndex];

  return (
    <div className="map-radar-hud" role="status" aria-live="polite">
      {/* Radar scanning beacon and corridor title */}
      <div className="map-radar-header">
        <div className="radar-beacon-wrapper">
          <div className="radar-ping" />
          <Radio size={16} color="#38bdf8" className="radar-icon" />
        </div>

        <div className="map-radar-corridor">
          <span className="map-radar-corridor-title">
            Analyzing Corridor Safety
          </span>
          {origin && destination && (
            <span className="map-radar-route-text">
              {origin} ➔ {destination}
            </span>
          )}
        </div>

        <span className="map-radar-badge">{currentStage.tag}</span>
      </div>

      {/* Dynamic stage detail */}
      <div className="map-radar-stage-body">
        <div className="map-radar-stage-icon">{currentStage.icon}</div>
        <div className="map-radar-stage-text">
          <div className="map-radar-stage-title">{currentStage.title}</div>
          <div className="map-radar-stage-detail">{currentStage.detail}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="map-radar-progress-track">
        <div
          className="map-radar-progress-bar"
          style={{ width: `${currentStage.progress}%` }}
        />
      </div>
    </div>
  );
};
