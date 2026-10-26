import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TripForm } from '../components/TripForm';

describe('TripForm Component', () => {
  it('renders all form fields and submit button', () => {
    const handleSubmit = vi.fn();
    render(<TripForm onSubmit={handleSubmit} isLoading={false} />);

    expect(screen.getByLabelText(/origin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/destination/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/departure date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/departure time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/load weight/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze route safety/i })).toBeInTheDocument();
  });

  it('submits form with valid inputs', () => {
    const handleSubmit = vi.fn();
    render(<TripForm onSubmit={handleSubmit} isLoading={false} />);

    const submitBtn = screen.getByRole('button', { name: /analyze route safety/i });
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedData = handleSubmit.mock.calls[0][0];
    expect(submittedData.origin).toBe('Chicago, IL');
    expect(submittedData.destination).toBe('Indianapolis, IN');
    expect(submittedData.load_lb).toBe(42000);
  });

  it('updates load weight when quick preset button is clicked', () => {
    const handleSubmit = vi.fn();
    render(<TripForm onSubmit={handleSubmit} isLoading={false} />);

    const btn45k = screen.getByRole('button', { name: /45k lb/i });
    fireEvent.click(btn45k);

    const loadInput = screen.getByLabelText(/load weight/i) as HTMLInputElement;
    expect(loadInput.value).toBe('45000');
  });
});
