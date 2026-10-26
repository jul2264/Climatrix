import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SentinelHUD } from '../components/SentinelHUD';
import { DiversionModal } from '../components/DiversionModal';
import type { RouteAnalysis, SentinelAssessment } from '../types';

describe('SentinelHUD and DiversionModal Components', () => {
  const mockRoute: RouteAnalysis = {
    id: 'route_1',
    distance_mi: 180.0,
    duration_min: 190.0,
    geometry: { type: 'LineString', coordinates: [[-87.6, 41.8], [-86.1, 39.7]] },
    summary: {
      no_travel_miles: 0,
      severe_miles: 0,
      high_miles: 0,
      avg_risk: 0.2,
      distance_mi: 180.0,
      duration_min: 190.0,
      max_level: 'LOW',
    },
    checkpoints: [
      {
        mile: 0,
        lat: 41.8,
        lon: -87.6,
        eta: '2026-10-26T12:00:00Z',
        wind_mph: 10,
        rain_in_hr: 0,
        snow_in_hr: 0,
        level: 'LOW',
        driver: null,
      },
      {
        mile: 180,
        lat: 39.7,
        lon: -86.1,
        eta: '2026-10-26T15:10:00Z',
        wind_mph: 12,
        rain_in_hr: 0,
        snow_in_hr: 0,
        level: 'LOW',
        driver: null,
      },
    ],
  };

  it('renders SentinelHUD with inactive state and toggles to active', () => {
    render(
      <SentinelHUD
        activeRoute={mockRoute}
        loadLb={42000}
        departureIso="2026-10-26T12:00:00Z"
      />
    );

    expect(screen.getByText(/corridor sentinel/i)).toBeInTheDocument();
    const toggleBtn = screen.getByRole('button', { name: /enable/i });
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);

    expect(screen.getByRole('button', { name: /active/i })).toBeInTheDocument();
    expect(screen.getByText(/truck position:/i)).toBeInTheDocument();
  });

  it('renders DiversionModal with emergency warnings and triggers action', () => {
    const handleDismiss = vi.fn();
    const handleConfirm = vi.fn();

    const mockAssessment: SentinelAssessment = {
      status: 'EMERGENCY',
      current_mile: 45.0,
      remaining_miles: 135.0,
      remaining_checkpoints: 2,
      highest_upcoming_risk: 'NO_TRAVEL',
      hazard_mile: 84.0,
      hazard_driver: 'wind',
      time_to_hazard_min: 39,
      escalated_checkpoints: [],
      explanation: 'Extreme crosswinds (58 mph) detected ahead.',
    };

    render(
      <DiversionModal
        assessment={mockAssessment}
        onDismiss={handleDismiss}
        onConfirmHaven={handleConfirm}
      />
    );

    expect(screen.getByText(/sentinel emergency diversion/i)).toBeInTheDocument();
    expect(screen.getByText(/extreme crosswinds \(58 mph\) detected ahead/i)).toBeInTheDocument();
    expect(screen.getByText(/~39 min/i)).toBeInTheDocument();

    const havenBtn = screen.getByRole('button', { name: /acknowledge & seek safe haven/i });
    fireEvent.click(havenBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
