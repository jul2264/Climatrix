import { describe, it, expect } from 'vitest';
import { calculateTruckPosition } from '../utils/truckPosition';
import type { RouteAnalysis, Checkpoint } from '../types';

describe('calculateTruckPosition', () => {
  const mockDeparture = '2026-10-27T08:00:00.000Z';

  // Helper to create synthetic checkpoints
  const createCheckpoint = (mile: number, lat: number, lon: number, hourOffset: number): Checkpoint => {
    const d = new Date(new Date(mockDeparture).getTime() + hourOffset * 3600 * 1000);
    return {
      mile,
      lat,
      lon,
      eta: d.toISOString(),
      wind_mph: 10,
      rain_in_hr: 0,
      snow_in_hr: 0,
      level: 'LOW',
      driver: null,
    };
  };

  it('returns null for null or empty routes', () => {
    expect(calculateTruckPosition(null, mockDeparture, 0)).toBeNull();
    const emptyRoute = { checkpoints: [] } as unknown as RouteAnalysis;
    expect(calculateTruckPosition(emptyRoute, mockDeparture, 0)).toBeNull();
  });

  it('clamps to Origin (Mile 0) at Hour 0 with depot status', () => {
    const checkpoints = [
      createCheckpoint(0, 41.8781, -87.6298, 0),
      createCheckpoint(100, 40.0, -86.0, 2),
      createCheckpoint(200, 39.0, -85.0, 4),
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: [] },
      distance_mi: 200,
      duration_min: 240,
      summary: {} as any,
      checkpoints,
    };

    const res = calculateTruckPosition(route, mockDeparture, 0);
    expect(res).not.toBeNull();
    expect(res!.mile).toBe(0);
    expect(res!.lat).toBeCloseTo(41.8781, 4);
    expect(res!.lon).toBeCloseTo(-87.6298, 4);
    expect(res!.status).toBe('depot');
    expect(res!.statusLabel).toContain('Mile 0');
  });

  it('interpolates intermediate coordinates accurately when en route', () => {
    const checkpoints = [
      createCheckpoint(0, 40.0, -90.0, 0),
      createCheckpoint(100, 40.0, -88.0, 2), // +2h
      createCheckpoint(200, 40.0, -86.0, 4), // +4h
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: [] },
      distance_mi: 200,
      duration_min: 240,
      summary: {} as any,
      checkpoints,
    };

    // Hour 1: exactly midway between Mile 0 and Mile 100
    const resH1 = calculateTruckPosition(route, mockDeparture, 1);
    expect(resH1).not.toBeNull();
    expect(resH1!.mile).toBe(50);
    expect(resH1!.lat).toBe(40.0);
    expect(resH1!.lon).toBe(-89.0);
    expect(resH1!.status).toBe('en_route');

    // Hour 3: exactly midway between Mile 100 and Mile 200
    const resH3 = calculateTruckPosition(route, mockDeparture, 3);
    expect(resH3).not.toBeNull();
    expect(resH3!.mile).toBe(150);
    expect(resH3!.lat).toBe(40.0);
    expect(resH3!.lon).toBe(-87.0);
    expect(resH3!.status).toBe('en_route');
  });

  it('clamps to Destination for short-haul trips completed within horizon (<48h)', () => {
    // 4-hour trip total
    const checkpoints = [
      createCheckpoint(0, 41.8781, -87.6298, 0),
      createCheckpoint(100, 40.5, -86.5, 2),
      createCheckpoint(180, 39.7684, -86.1581, 4), // Arrival at +4h
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: [] },
      distance_mi: 180,
      duration_min: 240,
      summary: {} as any,
      checkpoints,
    };

    // Scrubbing to Hour 6 (past arrival)
    const resH6 = calculateTruckPosition(route, mockDeparture, 6);
    expect(resH6).not.toBeNull();
    expect(resH6!.mile).toBe(180);
    expect(resH6!.lat).toBeCloseTo(39.7684, 4);
    expect(resH6!.lon).toBeCloseTo(-86.1581, 4);
    expect(resH6!.status).toBe('arrived');
    expect(resH6!.statusLabel).toContain('Arrived at Destination');

    // Scrubbing to Hour 48 (end of slider)
    const resH48 = calculateTruckPosition(route, mockDeparture, 48);
    expect(resH48!.status).toBe('arrived');
    expect(resH48!.mile).toBe(180);
  });

  it('enforces 48-hour hard-stop for long-haul routes (>48h) and does NOT leap to destination', () => {
    // 65-hour trip (e.g. 2900 miles)
    const checkpoints = [
      createCheckpoint(0, 45.0, -122.0, 0),        // Mile 0 (Hour 0)
      createCheckpoint(1000, 42.0, -110.0, 20),    // Mile 1000 (Hour 20)
      createCheckpoint(2000, 41.0, -90.0, 44),     // Mile 2000 (Hour 44)
      createCheckpoint(2200, 41.0, -85.0, 49),     // Mile 2200 (Hour 49)
      createCheckpoint(2900, 40.7, -74.0, 65),     // Mile 2900 (Hour 65 - Destination)
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: [] },
      distance_mi: 2900,
      duration_min: 3900, // 65 hours
      summary: {} as any,
      checkpoints,
    };

    // At Hour 48 (max slider hour)
    const res = calculateTruckPosition(route, mockDeparture, 48);
    expect(res).not.toBeNull();
    expect(res!.status).toBe('horizon_limit');
    expect(res!.statusLabel).toContain('+48h Limit');

    // Must be between Mile 2000 (Hour 44) and Mile 2200 (Hour 49)
    expect(res!.mile).toBeGreaterThan(2000);
    expect(res!.mile).toBeLessThan(2200);

    // Must NOT equal destination (Mile 2900, lat 40.7, lon -74.0)
    expect(res!.mile).not.toBe(2900);
    expect(res!.lon).toBeLessThan(-80.0);
  });

  it('clamps negative or out-of-bounds slider hours to [0, 48]', () => {
    const checkpoints = [
      createCheckpoint(0, 40.0, -90.0, 0),
      createCheckpoint(100, 40.0, -80.0, 2),
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: [] },
      distance_mi: 100,
      duration_min: 120,
      summary: {} as any,
      checkpoints,
    };

    const resNeg = calculateTruckPosition(route, mockDeparture, -5);
    expect(resNeg!.mile).toBe(0);
    expect(resNeg!.status).toBe('depot');

    const resOver = calculateTruckPosition(route, mockDeparture, 999);
    expect(resOver!.status).toBe('arrived');
  });

  it('strictly follows curved polyline geometry instead of cutting straight chord between checkpoints', () => {
    // Checkpoints are at Mile 0 and Mile 100, both at latitude 40.0
    // But the road curves northward to latitude 42.0 in the middle!
    const checkpoints = [
      createCheckpoint(0, 40.0, -90.0, 0),
      createCheckpoint(100, 40.0, -88.0, 2),
    ];
    // Road coordinates curve up to 42.0:
    const curvedCoordinates = [
      [-90.0, 40.0],
      [-89.0, 42.0], // Curved peak
      [-88.0, 40.0],
    ];
    const route: RouteAnalysis = {
      id: 'Route A',
      geometry: { type: 'LineString', coordinates: curvedCoordinates },
      distance_mi: 100,
      duration_min: 120,
      summary: {} as any,
      checkpoints,
    };

    // At hour 1 (midpoint of the trip):
    const res = calculateTruckPosition(route, mockDeparture, 1);
    expect(res).not.toBeNull();
    expect(res!.mile).toBe(50);
    // If it cut a straight chord, lat would be 40.0. Because it follows the road, lat must be near 42.0!
    expect(res!.lat).toBeGreaterThan(41.0);
    expect(res!.lon).toBeCloseTo(-89.0, 1);
  });
});
