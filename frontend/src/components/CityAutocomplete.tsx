import React, { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { Truck, MapPin, X } from 'lucide-react';
import { fetchCitySuggestions, type CitySuggestion } from '../api/client';
import { searchLocalFreightCities } from '../utils/freightCities';

export interface CityAutocompleteProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  onSelectNext?: () => void;
}

export const CityAutocomplete = forwardRef<HTMLInputElement, CityAutocompleteProps>(
  (
    {
      id,
      label,
      icon,
      value,
      onChange,
      placeholder = 'Enter city name or hub...',
      required = false,
      onSelectNext,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [networkSuggestions, setNetworkSuggestions] = useState<CitySuggestion[]>([]);
    const [isFetchingNetwork, setIsFetchingNetwork] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const internalInputRef = useRef<HTMLInputElement>(null);

    // Support forwarded ref
    useImperativeHandle(ref, () => internalInputRef.current as HTMLInputElement);

    // Tier 1: Instant local commercial freight hub match (0ms synchronous lookup)
    const localSuggestions = useMemo<CitySuggestion[]>(() => {
      const q = value.trim();
      if (q.length < 1) return [];

      return searchLocalFreightCities(q, 5).map((city) => ({
        label: city.label,
        name: city.name,
        state: city.state,
        lat: city.lat,
        lon: city.lon,
        isFreightHub: true,
      }));
    }, [value]);

    // Merged suggestions: local freight hubs prioritized, then Pelias network results
    const suggestions = useMemo<CitySuggestion[]>(() => {
      if (value.trim().length < 1) return [];

      const merged: CitySuggestion[] = [...localSuggestions];
      const seen = new Set(localSuggestions.map((m) => m.label.toLowerCase()));

      for (const item of networkSuggestions) {
        const key = item.label.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }

      return merged.slice(0, 7);
    }, [localSuggestions, networkSuggestions, value]);

    // Dismiss popover on outside click
    useEffect(() => {
      const handleOutsideClick = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    // Tier 2: Debounced ORS Pelias network query (200ms)
    useEffect(() => {
      const query = value.trim();

      if (query.length < 2) {
        return;
      }

      const timer = setTimeout(async () => {
        setIsFetchingNetwork(true);
        try {
          const results = await fetchCitySuggestions(query);
          setNetworkSuggestions(results);
        } catch {
          // Keep existing results if network fails
        } finally {
          setIsFetchingNetwork(false);
        }
      }, 200);

      return () => clearTimeout(timer);
    }, [value]);

    const handleSelect = (suggestion: CitySuggestion) => {
      onChange(suggestion.label);
      setIsOpen(false);
      setHighlightedIndex(-1);
      if (onSelectNext) {
        setTimeout(() => onSelectNext(), 50);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || suggestions.length === 0) {
        if (e.key === 'ArrowDown' && suggestions.length > 0) {
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
          if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
            e.preventDefault();
            handleSelect(suggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          break;
      }
    };

    const handleClear = () => {
      onChange('');
      setNetworkSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      internalInputRef.current?.focus();
    };

    // Helper to bold matching query prefix in suggestion labels
    const renderCityLabel = (labelStr: string, queryStr: string) => {
      const q = queryStr.trim().toLowerCase();
      if (!q) return <span>{labelStr}</span>;

      const lower = labelStr.toLowerCase();
      const matchIdx = lower.indexOf(q);

      if (matchIdx === -1) {
        return <span>{labelStr}</span>;
      }

      const before = labelStr.slice(0, matchIdx);
      const match = labelStr.slice(matchIdx, matchIdx + q.length);
      const after = labelStr.slice(matchIdx + q.length);

      return (
        <span>
          {before}
          <span className="city-autocomplete-item-match">{match}</span>
          {after}
        </span>
      );
    };

    return (
      <div className="input-group city-autocomplete-container" ref={containerRef}>
        <label className="input-label" htmlFor={id}>
          {icon}
          {label}
        </label>

        <div className="city-autocomplete-input-wrapper">
          <input
            ref={internalInputRef}
            id={id}
            type="text"
            className="text-input city-autocomplete-input"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(-1);
            }}
            onFocus={() => {
              if (suggestions.length > 0) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            required={required}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={`${id}-suggestions-list`}
          />

          <div className="city-autocomplete-icons">
            {isFetchingNetwork && <div className="city-autocomplete-spinner" title="Searching nationwide..." />}
            {value.length > 0 && (
              <button
                type="button"
                className="city-autocomplete-clear-btn"
                onClick={handleClear}
                title="Clear input"
                tabIndex={-1}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Option A: Floating Popover Attached directly beneath the Input */}
        {isOpen && suggestions.length > 0 && (
          <div className="city-autocomplete-popover">
            <ul id={`${id}-suggestions-list`} className="city-autocomplete-list" role="listbox">
              {suggestions.map((item, idx) => {
                const isSelected = idx === highlightedIndex;
                return (
                  <li
                    key={`${item.label}-${idx}`}
                    className={`city-autocomplete-item ${isSelected ? 'highlighted' : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(item)}
                  >
                    <div className="city-autocomplete-item-left">
                      {item.isFreightHub ? (
                        <Truck size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
                      ) : (
                        <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                      )}
                      <div className="city-autocomplete-item-text">
                        {renderCityLabel(item.label, value)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {item.isFreightHub && (
                        <span className="city-autocomplete-badge-hub">
                          Hub
                        </span>
                      )}
                      {item.state && !item.isFreightHub && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                          {item.state}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="city-autocomplete-footer">
              <span>↑↓ to navigate · Enter to select</span>
              {isFetchingNetwork ? (
                <span style={{ color: '#38bdf8' }}>Searching ORS Pelias...</span>
              ) : (
                <span>ORS Pelias</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

CityAutocomplete.displayName = 'CityAutocomplete';
