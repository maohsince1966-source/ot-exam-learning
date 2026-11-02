import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check, X, RotateCcw } from 'lucide-react';

export interface MultiYearSelectorProps {
  years: string[]; // e.g. ["61", "60", "59", ...] (descending order)
  selectedYears: string[]; // e.g. [] means all years, or ["61", "60"]
  onChange: (years: string[]) => void;
  questionCountsByYear?: Record<string, number>;
  theme?: 'indigo' | 'teal';
  label?: string;
  className?: string;
  compact?: boolean;
}

export const MultiYearSelector: React.FC<MultiYearSelectorProps> = ({
  years,
  selectedYears,
  onChange,
  questionCountsByYear = {},
  theme = 'teal',
  label,
  className = '',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Color schemes based on theme
  const isIndigo = theme === 'indigo';
  const activeColor = isIndigo ? 'indigo' : 'teal';
  const activeBtnBg = isIndigo ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white';
  const activeBadgeBg = isIndigo
    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
    : 'bg-teal-100 text-teal-800 border-teal-200';
  const focusRing = isIndigo ? 'focus:ring-indigo-500' : 'focus:ring-teal-500';

  // Toggle single year
  const handleToggleYear = (year: string) => {
    if (selectedYears.includes(year)) {
      onChange(selectedYears.filter(y => y !== year));
    } else {
      // Keep sorted in descending numerical order
      const next = [...selectedYears, year].sort((a, b) => Number(b) - Number(a));
      onChange(next);
    }
  };

  // Preset handlers
  const handleSelectAll = () => {
    onChange([]); // Empty array represents "all years"
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const handleSelectRecent = (count: number) => {
    const sorted = [...years].sort((a, b) => Number(b) - Number(a));
    const recent = sorted.slice(0, count);
    onChange(recent);
  };

  // Summary text for the trigger button
  const getTriggerText = () => {
    if (selectedYears.length === 0) {
      return 'すべての年度';
    }
    if (selectedYears.length === 1) {
      return `第${selectedYears[0]}回`;
    }
    if (selectedYears.length === 2) {
      return `第${selectedYears[0]}回・第${selectedYears[1]}回`;
    }
    return `第${selectedYears[0]}回 ほか${selectedYears.length - 1}年度`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            {label}
          </span>
          {selectedYears.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className={`text-[11px] font-medium text-${activeColor}-600 hover:underline flex items-center gap-0.5`}
            >
              <RotateCcw className="w-3 h-3" />
              すべての年度に戻す
            </button>
          )}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2.5 py-1.5 text-xs text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-between gap-1.5 focus:outline-none focus:ring-1 ${focusRing} ${
          selectedYears.length > 0 ? (isIndigo ? 'border-indigo-300 bg-indigo-50/40' : 'border-teal-300 bg-teal-50/40') : ''
        }`}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <Calendar className={`w-3.5 h-3.5 shrink-0 ${selectedYears.length > 0 ? (isIndigo ? 'text-indigo-600' : 'text-teal-600') : 'text-slate-400'}`} />
          <span className={`truncate font-medium ${selectedYears.length > 0 ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
            {getTriggerText()}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedYears.length > 0 ? (
            <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-md border ${activeBadgeBg}`}>
              {selectedYears.length}年度選択
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">全{years.length}年度</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Selected Years Tags Pill Bar (when 1 or more specific years selected) */}
      {!compact && selectedYears.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedYears.map(y => (
            <span
              key={y}
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${activeBadgeBg}`}
            >
              <span>第{y}回</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleYear(y);
                }}
                className="hover:opacity-70 p-0.5 rounded"
                title={`第${y}回の選択を解除`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          {selectedYears.length > 1 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] text-slate-500 hover:text-slate-800 underline self-center ml-1"
            >
              全解除
            </button>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-40 mt-1 left-0 right-0 sm:right-auto sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-3 space-y-2.5 animate-fadeIn">
          {/* Header & Quick Action Buttons */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <span>年度を選択（複数選択可）</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                  selectedYears.length === 0
                    ? `${activeBtnBg} font-bold`
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                すべての年度
              </button>
              {selectedYears.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] px-1.5 py-0.5 text-rose-600 hover:bg-rose-50 rounded font-medium"
                >
                  解除
                </button>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 text-[10px] shrink-0">プリセット:</span>
            <button
              type="button"
              onClick={() => handleSelectRecent(3)}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-medium text-[10px]"
            >
              直近3年
            </button>
            <button
              type="button"
              onClick={() => handleSelectRecent(5)}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-medium text-[10px]"
            >
              直近5年
            </button>
            <button
              type="button"
              onClick={() => handleSelectRecent(10)}
              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-medium text-[10px]"
            >
              直近10年
            </button>
          </div>

          {/* Year Buttons Grid */}
          <div className="max-h-56 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {years.map(y => {
                const isSelected = selectedYears.includes(y);
                const count = questionCountsByYear[y];

                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => handleToggleYear(y)}
                    className={`px-2 py-1.5 text-xs rounded-lg border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? isIndigo
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold ring-1 ring-indigo-400'
                          : 'bg-teal-50 border-teal-500 text-teal-900 font-bold ring-1 ring-teal-400'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] shrink-0 border ${
                        isSelected
                          ? isIndigo
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-teal-600 text-white border-teal-600'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                      <span className="truncate">第{y}回</span>
                    </div>
                    {count !== undefined && (
                      <span className={`text-[10px] shrink-0 ml-1 ${isSelected ? (isIndigo ? 'text-indigo-700' : 'text-teal-700') : 'text-slate-400'}`}>
                        {count}問
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer with summary and close button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {selectedYears.length === 0 ? (
                <span>全 {years.length} 年度を対象に表示中</span>
              ) : (
                <span><strong className="text-slate-900">{selectedYears.length}</strong> 年度を選択中</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${activeBtnBg} transition-colors shadow-2xs`}
            >
              決定
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
