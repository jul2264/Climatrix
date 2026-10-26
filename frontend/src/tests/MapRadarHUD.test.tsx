import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapRadarHUD } from '../components/MapRadarHUD';

describe('MapRadarHUD Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial stage telemetry and corridor text', () => {
    render(
      <MapRadarHUD
        origin="Los Angeles, CA"
        destination="New York, NY"
        loadLb={42000}
      />
    );

    expect(screen.getByText(/analyzing corridor safety/i)).toBeInTheDocument();
    expect(screen.getByText(/los angeles, ca ➔ new york, ny/i)).toBeInTheDocument();
    expect(screen.getByText(/locating 3 hgv highway corridors/i)).toBeInTheDocument();
    expect(screen.getByText(/ors hgv/i)).toBeInTheDocument();
  });

  it('advances through calculation stages over time', () => {
    render(
      <MapRadarHUD
        origin="Chicago, IL"
        destination="Indianapolis, IN"
        loadLb={45000}
      />
    );

    // Initial stage
    expect(screen.getByText(/locating 3 hgv highway corridors/i)).toBeInTheDocument();

    // Advance to stage 2
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.getByText(/sampling corridors & cumulative etas/i)).toBeInTheDocument();

    // Advance to stage 3
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByText(/streaming live doppler & wind streams/i)).toBeInTheDocument();

    // Advance to stage 4
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText(/evaluating rollover risk \(45k lb load\)/i)).toBeInTheDocument();
  });
});
