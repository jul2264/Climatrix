import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CityAutocomplete } from '../components/CityAutocomplete';

describe('CityAutocomplete Component', () => {
  it('renders input with label and placeholder', () => {
    const handleChange = vi.fn();
    render(
      <CityAutocomplete
        id="test-origin"
        label="Origin"
        value=""
        onChange={handleChange}
        placeholder="Enter city"
      />
    );

    expect(screen.getByLabelText(/origin/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter city/i)).toBeInTheDocument();
  });

  it('instantly suggests local freight hubs on keystroke', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <CityAutocomplete
        id="test-origin"
        label="Origin"
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/origin/i);
    fireEvent.change(input, { target: { value: 'Chi' } });

    // Rerender with updated controlled value
    rerender(
      <CityAutocomplete
        id="test-origin"
        label="Origin"
        value="Chi"
        onChange={handleChange}
      />
    );

    // Should display Chicago, IL with Hub badge
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveTextContent('Chicago, IL');
    expect(screen.getByText(/hub/i)).toBeInTheDocument();
  });

  it('selects suggestion when clicked', () => {
    const handleChange = vi.fn();
    const handleNext = vi.fn();

    render(
      <CityAutocomplete
        id="test-dest"
        label="Destination"
        value="Indy"
        onChange={handleChange}
        onSelectNext={handleNext}
      />
    );

    const input = screen.getByLabelText(/destination/i);
    fireEvent.focus(input);

    const suggestion = screen.getByText(/indianapolis, in/i);
    fireEvent.click(suggestion);

    expect(handleChange).toHaveBeenCalledWith('Indianapolis, IN');
  });

  it('supports keyboard navigation with ArrowDown and Enter', () => {
    const handleChange = vi.fn();
    render(
      <CityAutocomplete
        id="test-origin"
        label="Origin"
        value="Col"
        onChange={handleChange}
      />
    );

    const input = screen.getByLabelText(/origin/i);
    fireEvent.focus(input);

    // Arrow down to highlight first suggestion (Columbus, OH)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Press Enter to select
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('Columbus, OH');
  });

  it('clears input when clear button is clicked', () => {
    const handleChange = vi.fn();
    render(
      <CityAutocomplete
        id="test-origin"
        label="Origin"
        value="Denver"
        onChange={handleChange}
      />
    );

    const clearBtn = screen.getByTitle(/clear input/i);
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith('');
  });
});
