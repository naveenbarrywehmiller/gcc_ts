import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  label,
  labelKey = 'label',
  valueKey = 'value',
  searchable = true,
  clearable = false,
  disabled = false,
  error,
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen, searchable]);

  const filtered = options.filter(opt => {
    const lbl = typeof opt === 'string' ? opt : opt[labelKey];
    return lbl?.toLowerCase().includes(search.toLowerCase());
  });

  const selectedOption = options.find(opt => {
    const val = typeof opt === 'string' ? opt : opt[valueKey];
    return val === value;
  });

  const displayValue = selectedOption
    ? (typeof selectedOption === 'string' ? selectedOption : selectedOption[labelKey])
    : '';

  return (
    <div className="w-full" ref={containerRef}>
      {label && <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">{label}</label>}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          id={id}
          className={`input text-left flex items-center justify-between gap-2 ${error ? 'border-red-500 dark:border-red-400' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className={displayValue ? '' : 'text-surface-400 dark:text-surface-500'}>
            {displayValue || placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && value && (
              <span onClick={(e) => { e.stopPropagation(); onChange(null); }} className="p-0.5 hover:bg-surface-200 dark:hover:bg-surface-700 rounded">
                <X className="w-3 h-3" />
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-surface-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-850 border border-surface-200 dark:border-surface-700 rounded-lg shadow-xl animate-slide-down max-h-60 flex flex-col overflow-hidden">
            {searchable && (
              <div className="p-2 border-b border-surface-200 dark:border-surface-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-50 dark:bg-surface-800 rounded-md border-0 focus:ring-1 focus:ring-brand-500 text-surface-900 dark:text-surface-100 placeholder:text-surface-400"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-surface-400 text-center">No results found</div>
              ) : (
                filtered.map((opt, i) => {
                  const val = typeof opt === 'string' ? opt : opt[valueKey];
                  const lbl = typeof opt === 'string' ? opt : opt[labelKey];
                  const isSelected = val === value;
                  return (
                    <button
                      key={val || i}
                      type="button"
                      onClick={() => { onChange(val); setIsOpen(false); setSearch(''); }}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors
                        ${isSelected ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400' : 'text-surface-700 dark:text-surface-300'}`}
                    >
                      <span className="truncate">{lbl}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
