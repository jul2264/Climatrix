import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { TripForm } from './components/TripForm';
import { RouteCard } from './components/RouteCard';
import { MapView } from './components/MapView';
import { ExplanationBanner } from './components/ExplanationBanner';
import { Legend } from './components/Legend';
import { ForecastSlider } from './components/ForecastSlider';
import { DepartureOptimizerCard } from './components/DepartureOptimizerCard';
import { useRouteAnalysis } from './hooks/useRouteAnalysis';
import { useHeatmap } from './hooks/useHeatmap';
import type { AnalysisResponse, TripFormData } from './types';
import { AlertCircle } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const TruckRouteSafetyDashboard: React.FC = () => {
  const [analysisData, setAnalysisData]     = useState<AnalysisResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeTripParams, setActiveTripParams] = useState<TripFormData | null>(null);
  const [forecastHour, setForecastHour]     = useState<number>(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('climatrix_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('climatrix_theme', next);
      return next;
    });
  }, []);

  const { mutate: analyze, reset: resetAnalysis, isPending: isAnalyzing, error: analysisError } = useRouteAnalysis();

  const { data: heatmapData } = useHeatmap(
    activeTripParams?.origin,
    activeTripParams?.destination,
    activeTripParams?.load_lb,
    !isAnalyzing && Boolean(analysisData && activeTripParams?.origin)
  );

  const handleTripSubmit = useCallback(
    (formData: TripFormData) => {
      setForecastHour(0);
      setActiveTripParams(formData);
      resetAnalysis();
      analyze(formData, {
        onSuccess: (data) => {
          setAnalysisData(data);
          if (data.recommended_route_id) {
            setSelectedRouteId(data.recommended_route_id);
          } else if (data.routes && data.routes.length > 0) {
            setSelectedRouteId(data.routes[0].id);
          }
        },
      });
    },
    [analyze, resetAnalysis]
  );

  // Stable handler for MapView and ForecastSlider — prevents re-render of memoized children
  const handleSelectRoute = useCallback((id: string) => setSelectedRouteId(id), []);
  const handleHourChange  = useCallback((h: number) => setForecastHour(h), []);
  const handleApplyOptimizedDeparture = useCallback(
    (newDepartureIso: string) => {
      if (!activeTripParams) return;
      handleTripSubmit({
        ...activeTripParams,
        departure: newDepartureIso,
      });
    },
    [activeTripParams, handleTripSubmit]
  );

  // Run initial demo route analysis on mount so the user immediately sees live data
  useEffect(() => {
    const timer = setTimeout(() => {
      const d = new Date();
      d.setHours(d.getHours() + 1);
      d.setMinutes(0, 0, 0);
      handleTripSubmit({
        origin: 'Chicago, IL',
        destination: 'Indianapolis, IN',
        departure: d.toISOString(),
        load_lb: 45000,
        interval_miles: 25,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [handleTripSubmit]);

  const routes             = useMemo(() => analysisData?.routes ?? [], [analysisData]);
  const recommendedRouteId = analysisData?.recommended_route_id ?? null;
  const explanation        = analysisData?.explanation ?? '';

  // Memoize the route card list — only recreates when routes or selection changes
  const routeCards = useMemo(
    () =>
      routes.map((r) => (
        <RouteCard
          key={r.id}
          route={r}
          isSelected={r.id === selectedRouteId}
          isRecommended={r.id === recommendedRouteId}
          onSelect={() => setSelectedRouteId(r.id)}
        />
      )),
    [routes, selectedRouteId, recommendedRouteId]
  );

  return (
    <Layout
      theme={theme}
      onToggleTheme={handleToggleTheme}
      sidebarContent={
        <>
          {/* Trip Planning Input Form */}
          <TripForm onSubmit={handleTripSubmit} isLoading={isAnalyzing} />

          {/* Error Message if API fails */}
          {analysisError && !isAnalyzing && (
            <div
              className="glass-panel"
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                border: '1px solid #d32f2f',
                background: 'var(--bg-surface)',
                boxShadow: 'var(--shadow-subtle)',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.071em',
                  textTransform: 'uppercase',
                  color: '#d32f2f',
                  marginBottom: '4px',
                }}
              >
                <AlertCircle size={14} color="#d32f2f" />
                <span>ROUTING OR ANALYSIS ERROR</span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
                {analysisError.message}
              </p>
            </div>
          )}

          {/* Recommendation Banner */}
          {analysisData && (
            <ExplanationBanner
              recommendedRouteId={recommendedRouteId}
              explanation={explanation}
            />
          )}

          {/* Departure Window Optimizer Agent Card */}
          {analysisData?.departure_optimization && (
            <DepartureOptimizerCard
              optimization={analysisData.departure_optimization}
              onApplyDeparture={handleApplyOptimizedDeparture}
            />
          )}

          {/* Route Comparison List */}
          {routes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', zIndex: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 500,
                    letterSpacing: '0.071em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  ROUTE OPTIONS ({routes.length})
                </h3>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.04em',
                  }}
                >
                  SELECT TO INSPECT
                </span>
              </div>

              {routeCards}
            </div>
          )}

          {/* Initial Empty State */}
          {!isAnalyzing && !analysisData && !analysisError && (
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                textAlign: 'center',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                boxShadow: 'var(--shadow-subtle)',
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1, color: 'var(--color-carbon)' }}>▲</span>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                Ready to analyze
              </p>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                Enter origin, destination, and load to discover the safest truck corridors.
              </p>
            </div>
          )}
        </>
      }
      mapContent={
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <MapView
            routes={routes}
            selectedRouteId={selectedRouteId}
            recommendedRouteId={recommendedRouteId}
            onSelectRoute={handleSelectRoute}
            heatmapData={isAnalyzing ? null : heatmapData}
            forecastHour={forecastHour}
            isAnalyzing={isAnalyzing}
            activeOrigin={activeTripParams?.origin}
            activeDestination={activeTripParams?.destination}
            loadLb={activeTripParams?.load_lb}
            theme={theme}
          />
          <Legend />
        </div>
      }
      sliderContent={
        routes.length > 0 ? (
          <ForecastSlider
            currentHour={forecastHour}
            onHourChange={handleHourChange}
            departureTimeIso={activeTripParams?.departure}
          />
        ) : undefined
      }
    />
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TruckRouteSafetyDashboard />
    </QueryClientProvider>
  );
}
