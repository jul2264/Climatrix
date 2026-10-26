import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ForecastSlider } from '../components/ForecastSlider';

describe('ForecastSlider Component', () => {
  it('renders slider with current hour badge and play/pause controls', () => {
    const handleHourChange = vi.fn();
    render(
      <ForecastSlider
        currentHour={12}
        onHourChange={handleHourChange}
      />
    );

    const elements = screen.getAllByText(/\+12h/i);
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
  });

  it('triggers onHourChange when slider is moved', async () => {
    const handleHourChange = vi.fn();
    render(
      <ForecastSlider
        currentHour={0}
        onHourChange={handleHourChange}
      />
    );

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '24' } });

    await waitFor(() => {
      expect(handleHourChange).toHaveBeenCalledWith(24);
    });
  });
});
