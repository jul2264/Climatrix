import { useMutation } from '@tanstack/react-query';
import { analyzeTrip } from '../api/client';
import type { AnalysisResponse, TripFormData } from '../types';

export function useRouteAnalysis() {
  return useMutation<AnalysisResponse, Error, TripFormData>({
    mutationFn: (data: TripFormData) => analyzeTrip(data),
  });
}
