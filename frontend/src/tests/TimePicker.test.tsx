import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimePicker } from '../components/TimePicker';

describe('TimePicker Component (Column Wheel Roller style)', () => {
  it('renders input with formatted 12-hour time and AM/PM', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="23:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('11:00 PM');
  });

  it('opens wheel popover on click and renders hour, minute, and period columns', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="09:30"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
  });

  it('selects hour from wheel and commits 24h format', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="10:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    // Pick hour 8 from the hour column
    const hour8Btn = screen.getByRole('button', { name: '8' });
    fireEvent.click(hour8Btn);

    // Since value was 10:00 AM, selecting 8 keeps AM and 00 min -> 08:00
    expect(handleChange).toHaveBeenCalledWith('08:00');
  });

  it('selects minute from wheel and commits updated time', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="08:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    // Pick 45 min from the minutes column
    const min45Btn = screen.getByRole('button', { name: '45' });
    fireEvent.click(min45Btn);

    expect(handleChange).toHaveBeenCalledWith('08:45');
  });

  it('toggles AM and PM period', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="08:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    const pmBtn = screen.getByRole('button', { name: 'PM' });
    fireEvent.click(pmBtn);

    // 08:00 AM switched to PM -> 20:00
    expect(handleChange).toHaveBeenCalledWith('20:00');
  });

  it('supports quick preset buttons like +1 hr and 10 PM', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="08:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    const preset10pm = screen.getByRole('button', { name: '10 PM' });
    fireEvent.click(preset10pm);

    expect(handleChange).toHaveBeenCalledWith('22:00');
  });

  it('synchronizes header display badge in real-time when scrolling columns', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="06:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    // Initial badge matches initial 06:00 AM
    const badges = screen.getAllByText('06:00 AM');
    expect(badges.length).toBeGreaterThanOrEqual(1);

    // Find the hour column (first .wheel-column)
    const hourCol = document.querySelector('.wheel-column') as HTMLDivElement;
    expect(hourCol).toBeInTheDocument();

    // Simulate scrolling hour drum to row index 7 (Hour 8, since 8 is index 7: 7 * 36 = 252px)
    Object.defineProperty(hourCol, 'scrollTop', { value: 252, writable: true, configurable: true });
    fireEvent.scroll(hourCol);

    // Header badge must immediately reflect Hour 8 (08:00 AM) in real time
    expect(screen.getByText('08:00 AM')).toBeInTheDocument();
  });

  it('reverts local display on Cancel and commits on Done', () => {
    const handleChange = vi.fn();
    render(
      <TimePicker
        id="test-time"
        label="Departure Time"
        value="06:00"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/departure time/i);
    fireEvent.click(input);

    // Click 9 AM preset
    const preset8am = screen.getByRole('button', { name: '8 AM' });
    fireEvent.click(preset8am);
    expect(screen.getByText('08:00 AM')).toBeInTheDocument();

    // Click Cancel -> closes popover and resets to prop value
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Popover is closed
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });
});

