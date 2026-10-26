import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteCard } from '../components/RouteCard';
import { ExplanationBanner } from '../components/ExplanationBanner';
import { ForecastSlider } from '../components/ForecastSlider';
import type { RouteAnalysis } from '../types';

describe('Frontend Edge Case Handling', () => {
  it('correctly flags a route with No Travel checkpoints as NOT DRIVABLE', () => {
    const unsafeRoute: RouteAnalysis = {
      id: 'route_unsafe',
      distance_mi: 185.0,
      duration_min: 240,
      geometry: { type: 'LineString', coordinates: [[-87.6, 41.8], [-86.1, 39.7]] },
      summary: {
        no_travel_miles: 25.0,
        severe_miles: 10.0,
        high_miles: 5.0,
        avg_risk: 3.2,
        distance_mi: 185.0,
        duration_min: 240,
        max_level: 'NO_TRAVEL',
      },
      checkpoints: [
        {
          mile: 0,
          lat: 41.8,
          lon: -87.6,
          eta: '2026-10-25T12:00:00Z',
          wind_mph: 58.0,
          rain_in_hr: 0.0,
          snow_in_hr: 0.0,
          level: 'NO_TRAVEL',
          driver: 'wind',
        },
      ],
    };

    render(
      <RouteCard
        route={unsafeRoute}
        isSelected={false}
        isRecommended={false}
        onSelect={() => {}}
      />
    );

    // Assert that "NOT DRIVABLE" warning and "No Travel Hazard" are prominently rendered
    expect(screen.getByText(/not drivable/i)).toBeInTheDocument();
    expect(screen.getByText(/no travel hazard/i)).toBeInTheDocument();
  });

  it('renders hazard banner when no route is safe to travel', () => {
    render(
      <ExplanationBanner
        recommendedRouteId={null}
        explanation="All available corridors exceed safe truck operating limits due to severe winds. Strongly recommend delaying departure."
      />
    );

    expect(screen.getByText(/severe weather hazard alert/i)).toBeInTheDocument();
    expect(
      screen.getByText(/strongly recommend delaying departure/i)
    ).toBeInTheDocument();
  });

  it('handles ForecastSlider boundary hours (0h and 48h) correctly', () => {
    const onHourChange = vi.fn();
    const { rerender } = render(
      <ForecastSlider
        currentHour={0}
        onHourChange={onHourChange}
        departureTimeIso="2026-10-25T12:00:00Z"
      />
    );

    // Initial hour 0 label
    expect(screen.getByText(/\+0h \(Now\)/i)).toBeInTheDocument();

    // Rerender at upper bound 48h
    rerender(
      <ForecastSlider
        currentHour={48}
        onHourChange={onHourChange}
        departureTimeIso="2026-10-25T12:00:00Z"
      />
    );

    // Matches the slider badge and ticks
    expect(screen.getAllByText(/\+48h/i).length).toBeGreaterThan(0);
  });
});
