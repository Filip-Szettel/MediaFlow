import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function GlassSelect({
    value,
    onChange,
    options,
    placeholder = "Wybierz...",
    icon: Icon,
    className = "",
    label
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    const handleSelect = (optionValue) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && <label className="block text-slate-400 text-xs uppercase font-bold mb-2">{label}</label>}

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-xl border transition-all duration-200 outline-none
                    ${isOpen
                        ? 'bg-theme-header border-theme-accent text-theme-primary shadow-[0_0_15px_-3px_var(--neon-violet)]'
                        : 'bg-theme-panel border-theme text-theme-secondary hover:text-theme-primary hover:border-theme-primary/50'
                    }
                `}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {Icon && <Icon size={16} className={isOpen ? "text-theme-accent" : "text-theme-secondary"} />}
                    <span className="truncate font-medium">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 text-theme-secondary ${isOpen ? 'rotate-180 text-theme-accent' : ''}`}
                />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 top-full mt-2 w-full min-w-[180px] max-h-[240px] overflow-y-auto no-scrollbar 
                    rounded-xl border border-theme bg-[#0f0a1f] shadow-xl animate-in fade-in zoom-in-95 duration-200 origin-top">
                    <div className="p-1 flex flex-col gap-0.5">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                className={`
                                    w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group
                                    ${value === option.value
                                        ? 'bg-theme-accent/10 text-theme-accent'
                                        : 'text-theme-secondary hover:bg-white/5 hover:text-theme-primary'
                                    }
                                `}
                            >
                                <span className="truncate">{option.label}</span>
                                {value === option.value && <Check size={14} className="text-theme-accent animate-in zoom-in" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
