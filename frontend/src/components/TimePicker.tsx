import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Clock, Check } from 'lucide-react';

export interface TimePickerProps {
  id?: string;
  label?: string;
  value: string; // "HH:mm" (24h) e.g. "23:00" or "09:30"
  onChange: (val: string) => void;
  required?: boolean;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const PERIODS: ('AM' | 'PM')[] = ['AM', 'PM'];
const ITEM_HEIGHT = 36; // px per row

// Pure parser for HH:mm string to 12h parts
function parseTime(timeStr: string) {
  const parts = (timeStr || '12:00').split(':');
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h)) h = 12;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;

  // Round minute to nearest 5 min step for smooth wheel alignment
  const rawMin = isNaN(m) ? 0 : m;
  const roundedMin = Math.round(rawMin / 5) * 5 % 60;
  const minuteStr = String(roundedMin).padStart(2, '0');

  return {
    hour24: h,
    hour12: h12,
    minuteStr,
    period,
  };
}

// Format 12h representation back to 24h string "HH:mm"
function format24h(h12: number, minStr: string, period: 'AM' | 'PM'): string {
  let h24 = h12 % 12;
  if (period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${minStr}`;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  id = 'departure-time-input',
  label = 'Departure Time',
  value,
  onChange,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);
  const periodColRef = useRef<HTMLDivElement>(null);

  // Derive 12h representation directly from prop value
  const parsed = useMemo(() => parseTime(value), [value]);

  // Reactive state for 60fps real-time responsive sync between scroll and display
  const [activeHour12, setActiveHour12] = useState(parsed.hour12);
  const [activeMinuteStr, setActiveMinuteStr] = useState(parsed.minuteStr);
  const [activePeriod, setActivePeriod] = useState(parsed.period);

  const activeHourRef = useRef(activeHour12);
  const activeMinRef = useRef(activeMinuteStr);
  const activePeriodRef = useRef(activePeriod);

  // Sync ref values inside useEffect to avoid ref access during render
  useEffect(() => {
    activeHourRef.current = activeHour12;
    activeMinRef.current = activeMinuteStr;
    activePeriodRef.current = activePeriod;
  }, [activeHour12, activeMinuteStr, activePeriod]);

  const isUserScrollingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Commit value to parent onChange, with debouncing for scroll drag and immediate for clicks
  const triggerCommit = useCallback(
    (h12: number, minStr: string, period: 'AM' | 'PM', immediate = false) => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }

      const timeStr24 = format24h(h12, minStr, period);

      if (immediate) {
        isUserScrollingRef.current = false;
        onChange(timeStr24);
        return;
      }

      commitTimerRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
        onChange(timeStr24);
      }, 120);
    },
    [onChange]
  );

  // Synchronize when value prop changes externally (and user is not currently scrolling)
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      setActiveHour12(parsed.hour12);
      setActiveMinuteStr(parsed.minuteStr);
      setActivePeriod(parsed.period);
    }
  }, [parsed.hour12, parsed.minuteStr, parsed.period]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        triggerCommit(activeHourRef.current, activeMinRef.current, activePeriodRef.current, true);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [triggerCommit]);

  // Cleanup pending commit timers on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  // Scroll a specific column to an item index
  const scrollColumnToIndex = (
    col: HTMLDivElement | null,
    index: number,
    smooth = false
  ) => {
    if (!col || index < 0) return;
    const targetTop = index * ITEM_HEIGHT;
    if (Math.abs(col.scrollTop - targetTop) < 2) return;
    if (smooth && typeof col.scrollTo === 'function') {
      col.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      col.scrollTop = targetTop;
    }
  };

  // Instant scroll alignment upon popover opening without initial animation lag
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => {
        scrollColumnToIndex(hourColRef.current, HOURS.indexOf(activeHourRef.current), false);
        scrollColumnToIndex(minColRef.current, MINUTES.indexOf(activeMinRef.current), false);
        scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(activePeriodRef.current), false);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  // Real-time onScroll listeners: updates display badge and highlight styles immediately at 60fps
  const handleScrollHour = () => {
    if (!hourColRef.current) return;
    isUserScrollingRef.current = true;
    const scrollTop = hourColRef.current.scrollTop;
    const rawIdx = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(HOURS.length - 1, rawIdx));
    const nextHour = HOURS[clampedIdx];

    if (nextHour !== undefined && nextHour !== activeHourRef.current) {
      setActiveHour12(nextHour);
    }
    triggerCommit(nextHour, activeMinRef.current, activePeriodRef.current, false);
  };

  const handleScrollMinute = () => {
    if (!minColRef.current) return;
    isUserScrollingRef.current = true;
    const scrollTop = minColRef.current.scrollTop;
    const rawIdx = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(MINUTES.length - 1, rawIdx));
    const nextMin = MINUTES[clampedIdx];

    if (nextMin !== undefined && nextMin !== activeMinRef.current) {
      setActiveMinuteStr(nextMin);
    }
    triggerCommit(activeHourRef.current, nextMin, activePeriodRef.current, false);
  };

  const handleScrollPeriod = () => {
    if (!periodColRef.current) return;
    isUserScrollingRef.current = true;
    const scrollTop = periodColRef.current.scrollTop;
    const rawIdx = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIdx = Math.max(0, Math.min(PERIODS.length - 1, rawIdx));
    const nextPeriod = PERIODS[clampedIdx];

    if (nextPeriod !== undefined && nextPeriod !== activePeriodRef.current) {
      setActivePeriod(nextPeriod);
    }
    triggerCommit(activeHourRef.current, activeMinRef.current, nextPeriod, false);
  };

  // Wheel scroll handler: supports fine trackpad gliding and discrete mousewheel notches
  const handleWheelColumn = (
    e: React.WheelEvent<HTMLDivElement>,
    colRef: React.RefObject<HTMLDivElement | null>,
    itemsLength: number
  ) => {
    e.preventDefault();
    if (!colRef.current) return;

    // Trackpad gesture (small continuous delta): scroll naturally
    if (Math.abs(e.deltaY) < 40 && e.deltaMode === 0) {
      colRef.current.scrollTop += e.deltaY;
      return;
    }

    // Discrete mousewheel notch: step by 1 item with immediate response
    const direction = e.deltaY > 0 ? 1 : -1;
    const currentIdx = Math.round(colRef.current.scrollTop / ITEM_HEIGHT);
    const nextIdx = Math.max(0, Math.min(itemsLength - 1, currentIdx + direction));
    scrollColumnToIndex(colRef.current, nextIdx, true);
  };

  // Pointer drag state for rotary drums
  const dragStateRef = useRef<{
    isDragging: boolean;
    startY: number;
    startScrollTop: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startY: 0,
    startScrollTop: 0,
    hasMoved: false,
  });

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    colRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (!colRef.current) return;
    dragStateRef.current = {
      isDragging: true,
      startY: e.clientY,
      startScrollTop: colRef.current.scrollTop,
      hasMoved: false,
    };
    if (typeof colRef.current.setPointerCapture === 'function') {
      try {
        colRef.current.setPointerCapture(e.pointerId);
      } catch {
        // ignore if unsupported
      }
    }
  };

  const handlePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    colRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (!dragStateRef.current.isDragging || !colRef.current) return;
    const delta = e.clientY - dragStateRef.current.startY;
    if (Math.abs(delta) > 3) {
      dragStateRef.current.hasMoved = true;
    }
    colRef.current.scrollTop = dragStateRef.current.startScrollTop - delta;
  };

  const handlePointerUp = (
    e: React.PointerEvent<HTMLDivElement>,
    colRef: React.RefObject<HTMLDivElement | null>,
    itemsLength: number
  ) => {
    if (!dragStateRef.current.isDragging || !colRef.current) return;
    dragStateRef.current.isDragging = false;
    if (typeof colRef.current.releasePointerCapture === 'function') {
      try {
        colRef.current.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    if (dragStateRef.current.hasMoved) {
      const targetIdx = Math.max(
        0,
        Math.min(itemsLength - 1, Math.round(colRef.current.scrollTop / ITEM_HEIGHT))
      );
      scrollColumnToIndex(colRef.current, targetIdx, true);
    }
  };

  // Item click handlers: smooth scroll column and immediately commit
  const handleHourClick = (h: number) => {
    setActiveHour12(h);
    scrollColumnToIndex(hourColRef.current, HOURS.indexOf(h), true);
    triggerCommit(h, activeMinRef.current, activePeriodRef.current, true);
  };

  const handleMinuteClick = (m: string) => {
    setActiveMinuteStr(m);
    scrollColumnToIndex(minColRef.current, MINUTES.indexOf(m), true);
    triggerCommit(activeHourRef.current, m, activePeriodRef.current, true);
  };

  const handlePeriodClick = (p: 'AM' | 'PM') => {
    setActivePeriod(p);
    scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(p), true);
    triggerCommit(activeHourRef.current, activeMinRef.current, p, true);
  };

  // Quick Presets
  const handleQuickPreset = (h24: number, m: number) => {
    const p: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const roundedM = Math.round(m / 5) * 5 % 60;
    const mStr = String(roundedM).padStart(2, '0');

    setActiveHour12(h12);
    setActiveMinuteStr(mStr);
    setActivePeriod(p);

    scrollColumnToIndex(hourColRef.current, HOURS.indexOf(h12), true);
    scrollColumnToIndex(minColRef.current, MINUTES.indexOf(mStr), true);
    scrollColumnToIndex(periodColRef.current, PERIODS.indexOf(p), true);

    triggerCommit(h12, mStr, p, true);
  };

  const handleNowPreset = () => {
    const now = new Date();
    handleQuickPreset(now.getHours(), now.getMinutes());
  };

  const handlePlusOneHour = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    handleQuickPreset(now.getHours(), 0);
  };

  const handleDone = () => {
    triggerCommit(activeHourRef.current, activeMinRef.current, activePeriodRef.current, true);
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setActiveHour12(parsed.hour12);
    setActiveMinuteStr(parsed.minuteStr);
    setActivePeriod(parsed.period);
    setIsOpen(false);
  };

  // Real-time formatted display string "08:00 AM"
  const displayFormatted = `${String(activeHour12).padStart(2, '0')}:${activeMinuteStr} ${activePeriod}`;

  return (
    <div
      className="input-group"
      style={{ position: 'relative', zIndex: isOpen ? 50 : 1 }}
      ref={containerRef}
    >
      <label className="input-label" htmlFor={id}>
        <Clock size={14} color="#38bdf8" />
        {label}
      </label>

      <div
        className="time-picker-input-wrapper"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <input
          id={id}
          type="text"
          className="text-input"
          style={{ cursor: 'pointer', paddingRight: '36px', fontWeight: 600, letterSpacing: '0.02em' }}
          value={displayFormatted}
          readOnly
          required={required}
        />
        <div
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Clock size={16} />
        </div>
      </div>

      {/* iOS / Column Wheel Roller Time Picker Popover Window */}
      {isOpen && (
        <div className="wheel-time-picker-popover">
          {/* Header Display */}
          <div className="wheel-picker-header">
            <span className="wheel-picker-title">Departure Time</span>
            <span className="wheel-picker-display-badge">{displayFormatted}</span>
          </div>

          {/* 3-Column Roller Wheel View */}
          <div className="wheel-drum-container">
            {/* Horizontal Center Highlight Bar */}
            <div className="wheel-highlight-bar" />

            {/* Top & Bottom Cylinder Gradient Masks */}
            <div className="wheel-gradient-top" />
            <div className="wheel-gradient-bottom" />

            {/* Column 1: Hours */}
            <div
              className="wheel-column"
              ref={hourColRef}
              onScroll={handleScrollHour}
              onWheel={(e) => handleWheelColumn(e, hourColRef, HOURS.length)}
              onPointerDown={(e) => handlePointerDown(e, hourColRef)}
              onPointerMove={(e) => handlePointerMove(e, hourColRef)}
              onPointerUp={(e) => handlePointerUp(e, hourColRef, HOURS.length)}
              onPointerCancel={(e) => handlePointerUp(e, hourColRef, HOURS.length)}
            >
              <div className="wheel-column-padding" />
              {HOURS.map((h) => {
                const isSelected = activeHour12 === h;
                const diff = Math.abs(activeHour12 - h);
                const itemClass = isSelected
                  ? 'wheel-item selected'
                  : diff === 1
                  ? 'wheel-item near'
                  : diff === 2
                  ? 'wheel-item far'
                  : 'wheel-item out';

                return (
                  <button
                    type="button"
                    key={`h-${h}`}
                    className={itemClass}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleHourClick(h);
                    }}
                  >
                    {h}
                  </button>
                );
              })}
              <div className="wheel-column-padding" />
            </div>

            {/* Column Divider / Colon */}
            <div className="wheel-divider">:</div>

            {/* Column 2: Minutes (5-min increments matching screenshot) */}
            <div
              className="wheel-column"
              ref={minColRef}
              onScroll={handleScrollMinute}
              onWheel={(e) => handleWheelColumn(e, minColRef, MINUTES.length)}
              onPointerDown={(e) => handlePointerDown(e, minColRef)}
              onPointerMove={(e) => handlePointerMove(e, minColRef)}
              onPointerUp={(e) => handlePointerUp(e, minColRef, MINUTES.length)}
              onPointerCancel={(e) => handlePointerUp(e, minColRef, MINUTES.length)}
            >
              <div className="wheel-column-padding" />
              {MINUTES.map((m) => {
                const isSelected = activeMinuteStr === m;
                const currentIdx = MINUTES.indexOf(activeMinuteStr);
                const thisIdx = MINUTES.indexOf(m);
                const diff = Math.abs(currentIdx - thisIdx);
                const itemClass = isSelected
                  ? 'wheel-item selected'
                  : diff === 1
                  ? 'wheel-item near'
                  : diff === 2
                  ? 'wheel-item far'
                  : 'wheel-item out';

                return (
                  <button
                    type="button"
                    key={`m-${m}`}
                    className={itemClass}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMinuteClick(m);
                    }}
                  >
                    {m}
                  </button>
                );
              })}
              <div className="wheel-column-padding" />
            </div>

            {/* Column 3: AM / PM */}
            <div
              className="wheel-column period-col"
              ref={periodColRef}
              onScroll={handleScrollPeriod}
              onWheel={(e) => handleWheelColumn(e, periodColRef, PERIODS.length)}
              onPointerDown={(e) => handlePointerDown(e, periodColRef)}
              onPointerMove={(e) => handlePointerMove(e, periodColRef)}
              onPointerUp={(e) => handlePointerUp(e, periodColRef, PERIODS.length)}
              onPointerCancel={(e) => handlePointerUp(e, periodColRef, PERIODS.length)}
            >
              <div className="wheel-column-padding" />
              {PERIODS.map((p) => {
                const isSelected = activePeriod === p;
                return (
                  <button
                    type="button"
                    key={`p-${p}`}
                    className={`wheel-item ${isSelected ? 'selected' : 'near'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePeriodClick(p);
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <div className="wheel-column-padding" />
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div className="wheel-presets-bar">
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleNowPreset();
              }}
            >
              Now
            </button>
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handlePlusOneHour();
              }}
            >
              +1 hr
            </button>
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickPreset(8, 0);
              }}
            >
              8 AM
            </button>
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickPreset(12, 0);
              }}
            >
              12 PM
            </button>
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickPreset(18, 0);
              }}
            >
              6 PM
            </button>
            <button
              type="button"
              className="wheel-preset-pill"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickPreset(22, 0);
              }}
            >
              10 PM
            </button>
          </div>

          {/* Footer Actions */}
          <div className="wheel-footer">
            <button
              type="button"
              className="wheel-btn cancel"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="wheel-btn ok"
              onClick={(e) => {
                e.stopPropagation();
                handleDone();
              }}
            >
              <Check size={13} />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
