import React from 'react';
import { Sun, Moon } from 'lucide-react';

interface LayoutProps {
  sidebarContent: React.ReactNode;
  mapContent: React.ReactNode;
  sliderContent?: React.ReactNode;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  sidebarContent,
  mapContent,
  sliderContent,
  theme,
  onToggleTheme,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    >
      {/* ── Top Nav Bar — DESIGN.md spec: 64px, sticky, background paper-white,
           backdrop blur, wordmark left (▲ + name), action cluster right ── */}
      <header
        style={{
          height: '60px',
          padding: '0 24px',
          background: theme === 'dark'
            ? 'rgba(15,15,15,0.92)'
            : 'rgba(250,250,250,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${theme === 'dark' ? '#2a2a2a' : 'var(--color-hairline)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        {/* Wordmark: ▲ + CLIMATRIX */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* ▲ Triangle brand mark — pure black, per DESIGN.md "The Triangle Protocol" */}
          <span
            aria-hidden="true"
            style={{
              fontSize: '18px',
              lineHeight: 1,
              color: theme === 'dark' ? '#ffffff' : 'var(--color-carbon)',
              userSelect: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          >
            ▲
          </span>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '14px',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              CLIMATRIX
            </h1>
            {/* Eyebrow label for product identity — Geist Mono style */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 400,
                letterSpacing: '0.071em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              TRUCK ROUTE SAFETY
            </span>
          </div>
        </div>

        {/* Right cluster: Theme toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <div className={`theme-toggle-track ${theme}`}>
              <span className="theme-toggle-icon sun">
                <Sun size={11} />
              </span>
              <span className="theme-toggle-icon moon">
                <Moon size={11} />
              </span>
              <div className={`theme-toggle-thumb ${theme}`} />
            </div>
            <span className="theme-toggle-label">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </button>
        </div>
      </header>

      {/* Main: Sidebar + Map */}
      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 60px)', position: 'relative', overflow: 'hidden' }}>
        {/* Left Sidebar */}
        <aside
          style={{
            width: '420px',
            maxWidth: '100%',
            height: '100%',
            overflowY: 'auto',
            padding: '16px',
            background: theme === 'dark'
              ? '#0f0f0f'
              : 'var(--color-paper-white)',
            borderRight: `1px solid ${theme === 'dark' ? '#2a2a2a' : 'var(--color-hairline)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 15,
            flexShrink: 0,
          }}
        >
          {sidebarContent}
        </aside>

        {/* Right Map Canvas with Overlay Controls */}
        <main style={{ flex: 1, position: 'relative', height: '100%' }}>
          {mapContent}
          {sliderContent}
        </main>
      </div>
    </div>
  );
};
