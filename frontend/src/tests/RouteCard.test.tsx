import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RouteCard } from '../components/RouteCard';
import type { RouteAnalysis } from '../types';

const mockRoute: RouteAnalysis = {
  id: 'Route A',
  distance_mi: 285.5,
  duration_min: 340,
  summary: {
    no_travel_miles: 0,
    severe_miles: 0,
    high_miles: 15,
    avg_risk: 0.45,
    distance_mi: 285.5,
    duration_min: 340,
    max_level: 'MODERATE',
  },
  geometry: {
    type: 'LineString',
    coordinates: [[-87.6, 41.8], [-86.1, 39.7]],
  },
  checkpoints: [],
};

describe('RouteCard Component', () => {
  it('renders route details, distance, duration, and metrics', () => {
    const handleSelect = vi.fn();
    render(
      <RouteCard
        route={mockRoute}
        isSelected={false}
        isRecommended={true}
        onSelect={handleSelect}
      />
    );

    expect(screen.getByText('Route A')).toBeInTheDocument();
    expect(screen.getByLabelText(/recommended route/i)).toBeInTheDocument();
    expect(screen.queryByText('RECOMMENDED')).not.toBeInTheDocument();
    expect(screen.getByText('285.5 miles')).toBeInTheDocument();
    expect(screen.getByText('5h 40m')).toBeInTheDocument();
    expect(screen.getByText('Moderate Risk')).toBeInTheDocument();
  });

  it('triggers onSelect when card is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <RouteCard
        route={mockRoute}
        isSelected={false}
        isRecommended={false}
        onSelect={handleSelect}
      />
    );

    fireEvent.click(screen.getByText('Route A'));
    expect(handleSelect).toHaveBeenCalledTimes(1);
  });
});
