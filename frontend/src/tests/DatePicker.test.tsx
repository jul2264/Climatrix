import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DatePicker } from '../components/DatePicker';

describe('DatePicker Component (eBay Design System)', () => {
  it('renders input with initial MM-DD-YYYY format', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Departure Date"
        value="10-25-2026"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure date/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('10-25-2026');
  });

  it('opens eBay style popover when clicked and renders month/year navigation', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Departure Date"
        value="10-25-2026"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure date/i);
    fireEvent.click(input);

    expect(screen.getByText(/October 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('selects a date and fires onChange with MM-DD-YYYY format', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Departure Date"
        value="10-25-2026"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure date/i);
    fireEvent.click(input);

    // Pick day 15
    const dayBtn = screen.getByRole('button', { name: '15' });
    fireEvent.click(dayBtn);

    expect(handleChange).toHaveBeenCalledWith('10-15-2026');
  });

  it('clicking Today button triggers onChange with current date in MM-DD-YYYY format', () => {
    const handleChange = vi.fn();
    render(
      <DatePicker
        id="test-date"
        label="Departure Date"
        value="01-01-2026"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure date/i);
    fireEvent.click(input);

    const todayBtn = screen.getByRole('button', { name: /today/i });
    fireEvent.click(todayBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const calledWith = handleChange.mock.calls[0][0];
    expect(calledWith).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });
});
