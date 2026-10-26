import { useQuery } from '@tanstack/react-query';
import { fetchHeatmap } from '../api/client';
import type { HeatmapFeatureCollection } from '../types';

export function useHeatmap(origin?: string, destination?: string, load_lb?: number, enabled = true) {
  return useQuery<HeatmapFeatureCollection, Error>({
    queryKey: ['heatmap', origin, destination, load_lb],
    queryFn: () => fetchHeatmap(origin, destination, load_lb),
    enabled: Boolean(origin && destination && enabled),
    staleTime: 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus: false,
  });
}
