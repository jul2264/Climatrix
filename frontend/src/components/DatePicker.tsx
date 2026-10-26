import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DatePickerProps {
  id?: string;
  label?: string;
  value: string; // Format: "MM-DD-YYYY"
  onChange: (val: string) => void;
  required?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Pure date parser (MM-DD-YYYY)
function parseDateValue(str: string): { month: number; day: number; year: number } {
  const parts = str.split('-').map((p) => parseInt(p, 10));
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return { month: parts[0] - 1, day: parts[1], year: parts[2] };
  }
  return { month: 9, day: 25, year: 2026 };
}

export const DatePicker: React.FC<DatePickerProps> = ({
  id = 'departure-date-input',
  label = 'Departure Date',
  value,
  onChange,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [navView, setNavView] = useState<{ month: number; year: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive active view month/year from navView or current value
  const parsedValue = useMemo(() => parseDateValue(value), [value]);
  const viewMonth = navView !== null ? navView.month : parsedValue.month;
  const viewYear = navView !== null ? navView.year : parsedValue.year;

  // Click outside to close popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setNavView({ month: 11, year: viewYear - 1 });
    } else {
      setNavView({ month: viewMonth - 1, year: viewYear });
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setNavView({ month: 0, year: viewYear + 1 });
    } else {
      setNavView({ month: viewMonth + 1, year: viewYear });
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const formatted = `${mStr}-${dStr}-${viewYear}`;
    onChange(formatted);
    setNavView(null);
    setIsOpen(false);
  };

  const handleSetToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date();
    const mStr = String(now.getMonth() + 1).padStart(2, '0');
    const dStr = String(now.getDate()).padStart(2, '0');
    const yStr = String(now.getFullYear());
    onChange(`${mStr}-${dStr}-${yStr}`);
    setNavView({ month: now.getMonth(), year: now.getFullYear() });
    setIsOpen(false);
  };

  // Generate days for current view
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const isSelectedDate = (day: number) =>
    parsedValue.year === viewYear &&
    parsedValue.month === viewMonth &&
    parsedValue.day === day;

  return (
    <div
      className="input-group"
      style={{ position: 'relative', zIndex: isOpen ? 50 : 1 }}
      ref={containerRef}
    >
      <label className="input-label" htmlFor={id}>
        <CalendarIcon size={14} color="#60a5fa" />
        {label}
      </label>

      <div
        className="date-picker-input-wrapper"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setNavView(null);
        }}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <input
          id={id}
          type="text"
          className="text-input"
          style={{ cursor: 'pointer', paddingRight: '36px', fontWeight: 600, letterSpacing: '0.02em' }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="MM-DD-YYYY"
          required={required}
          readOnly
        />
        <div
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CalendarIcon size={16} />
        </div>
      </div>

      {/* eBay Design System Style Floating Date Picker Popover */}
      {isOpen && (
        <div className="ebay-date-picker-popover">
          {/* Header with Month, Year & Chevrons */}
          <div className="ebay-date-picker-header">
            <button
              type="button"
              className="ebay-date-picker-nav-btn"
              onClick={handlePrevMonth}
              title="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="ebay-date-picker-month-title">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              className="ebay-date-picker-nav-btn"
              onClick={handleNextMonth}
              title="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Days of week header */}
          <div className="ebay-date-picker-weekdays">
            {DAYS_OF_WEEK.map((d) => (
              <span key={d} className="ebay-date-picker-weekday">
                {d}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div className="ebay-date-picker-days-grid">
            {/* Previous month filler days */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => {
              const dNum = daysInPrevMonth - firstDayOfWeek + idx + 1;
              return (
                <div key={`prev-${idx}`} className="ebay-date-picker-day outside">
                  {dNum}
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected = isSelectedDate(day);

              return (
                <button
                  type="button"
                  key={`cur-${day}`}
                  className={`ebay-date-picker-day current ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectDay(day);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="ebay-date-picker-footer">
            <button
              type="button"
              className="ebay-date-picker-action-btn"
              onClick={handleSetToday}
            >
              Today
            </button>
            <button
              type="button"
              className="ebay-date-picker-action-btn primary"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
