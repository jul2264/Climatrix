import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Layout } from '../components/Layout';

describe('Theme Toggle in Layout', () => {
  it('renders theme toggle button with Dark Mode label when theme is dark', () => {
    const handleToggle = vi.fn();
    render(
      <Layout
        theme="dark"
        onToggleTheme={handleToggle}
        sidebarContent={<div>Sidebar</div>}
        mapContent={<div>Map</div>}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
  });

  it('renders theme toggle button with Light Mode label when theme is light', () => {
    const handleToggle = vi.fn();
    render(
      <Layout
        theme="light"
        onToggleTheme={handleToggle}
        sidebarContent={<div>Sidebar</div>}
        mapContent={<div>Map</div>}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /switch to dark mode/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
  });

  it('clicking toggle button invokes onToggleTheme callback', () => {
    const handleToggle = vi.fn();
    render(
      <Layout
        theme="dark"
        onToggleTheme={handleToggle}
        sidebarContent={<div>Sidebar</div>}
        mapContent={<div>Map</div>}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /switch to light mode/i });
    fireEvent.click(toggleBtn);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
