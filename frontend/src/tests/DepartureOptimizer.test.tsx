import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DepartureOptimizerCard } from '../components/DepartureOptimizerCard';
import type { DepartureOptimization } from '../types';

describe('DepartureOptimizerCard Component', () => {
  const mockOptimization: DepartureOptimization = {
    requested_departure: '2026-10-26T12:00:00Z',
    recommended_departure: '2026-10-26T15:00:00Z',
    recommended_offset_hours: 3,
    severe_miles_eliminated: 42.5,
    avg_risk_reduction: 1.8,
    is_drivable: true,
    explanation: 'Delaying departure by 3 hours eliminates 42.5 miles of Severe conditions.',
    candidates: [
      {
        offset_hours: -2,
        departure_iso: '2026-10-26T10:00:00Z',
        no_travel_miles: 0,
        severe_miles: 20.0,
        high_miles: 10.0,
        avg_risk: 2.1,
        is_drivable: true,
        recommended_route_id: 'route_1',
        max_level: 'SEVERE',
      },
      {
        offset_hours: 0,
        departure_iso: '2026-10-26T12:00:00Z',
        no_travel_miles: 15.0,
        severe_miles: 42.5,
        high_miles: 10.0,
        avg_risk: 3.4,
        is_drivable: false,
        recommended_route_id: null,
        max_level: 'NO_TRAVEL',
      },
      {
        offset_hours: 3,
        departure_iso: '2026-10-26T15:00:00Z',
        no_travel_miles: 0,
        severe_miles: 0,
        high_miles: 5.0,
        avg_risk: 1.1,
        is_drivable: true,
        recommended_route_id: 'route_1',
        max_level: 'HIGH',
      },
    ],
  };

  it('renders recommendation header and explanation', () => {
    const handleApply = vi.fn();
    render(
      <DepartureOptimizerCard
        optimization={mockOptimization}
        onApplyDeparture={handleApply}
      />
    );

    expect(screen.getByText(/departure window optimizer/i)).toBeInTheDocument();
    expect(screen.queryByText(/agent guidance/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/delaying departure by 3 hours eliminates 42\.5 miles of severe conditions/i)
    ).toBeInTheDocument();
  });

  it('shows severe miles eliminated and triggers onApplyDeparture on button click', () => {
    const handleApply = vi.fn();
    render(
      <DepartureOptimizerCard
        optimization={mockOptimization}
        onApplyDeparture={handleApply}
      />
    );

    expect(screen.getByText(/42\.5 mi eliminated/i)).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', { name: /apply shift/i });
    expect(applyBtn).toBeInTheDocument();
    fireEvent.click(applyBtn);

    expect(handleApply).toHaveBeenCalledWith('2026-10-26T15:00:00Z');
  });

  it('opens inbuilt departure windows when Departure Windows button is clicked and collapses on second click', () => {
    const handleApply = vi.fn();
    render(
      <DepartureOptimizerCard
        optimization={mockOptimization}
        onApplyDeparture={handleApply}
      />
    );

    // Departure windows button is rendered
    const windowsBtn = screen.getByRole('button', { name: /departure windows/i });
    expect(windowsBtn).toBeInTheDocument();

    // Before clicking, inbuilt windows are hidden
    expect(screen.queryByText(/\(-4h to \+12h\)/i)).not.toBeInTheDocument();

    // Click Departure Windows -> opens up the inbuilt windows below the button
    fireEvent.click(windowsBtn);

    expect(screen.getByText(/\(-4h to \+12h\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/now/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/\+3h/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/-2h/i)).toBeInTheDocument();

    // Click again to toggle collapse
    fireEvent.click(windowsBtn);
    expect(screen.queryByText(/\(-4h to \+12h\)/i)).not.toBeInTheDocument();
  });

  it('allows clicking candidate in the grid to directly select, apply new departure, and close windows upon selection', () => {
    const handleApply = vi.fn();
    render(
      <DepartureOptimizerCard
        optimization={mockOptimization}
        onApplyDeparture={handleApply}
      />
    );

    // Open inbuilt windows below button
    const windowsBtn = screen.getByRole('button', { name: /departure windows/i });
    fireEvent.click(windowsBtn);

    // Click candidate -2h in grid directly
    const candidateBtn = screen.getByRole('button', { name: /-2h/i });
    fireEvent.click(candidateBtn);

    expect(handleApply).toHaveBeenCalledWith('2026-10-26T10:00:00Z');
    // Inbuilt windows close upon selection
    expect(screen.queryByText(/\(-4h to \+12h\)/i)).not.toBeInTheDocument();
  });
});


