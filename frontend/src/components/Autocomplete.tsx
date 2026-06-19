/**
 * Autocomplete — componente genérico de búsqueda incremental.
 *
 * Características:
 *   - Debouncing automático (300 ms).
 *   - Dropdown bajo el input con coincidencias.
 *   - Navegación con teclado (↑/↓/Enter/Esc).
 *   - Render personalizable de cada opción (prop `renderOption`).
 *   - Estética "Ledger Modern".
 */
import { useEffect, useRef, useState } from 'react';

export interface AutocompleteProps<T> {
    fetcher: (query: string) => Promise<T[]>;
    onSelect: (option: T) => void;
    renderOption: (option: T, isHighlighted: boolean) => React.ReactNode;
    getOptionLabel?: (option: T) => string;
    initialValue?: string;
    placeholder?: string;
    minChars?: number;
    debounceMs?: number;
    autoFocus?: boolean;
    className?: string;
    inputClassName?: string;
}

export default function Autocomplete<T>({
    fetcher,
    onSelect,
    renderOption,
    getOptionLabel,
    initialValue = '',
    placeholder = 'Buscar…',
    minChars = 1,
    debounceMs = 300,
    autoFocus = false,
    className = '',
    inputClassName = '',
}: AutocompleteProps<T>) {
    const [query, setQuery] = useState(initialValue);
    const [options, setOptions] = useState<T[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const requestSeq = useRef(0);

    useEffect(() => {
        if (query.trim().length < minChars) {
            setOptions([]);
            setOpen(false);
            return;
        }
        setLoading(true);
        const seq = ++requestSeq.current;
        const t = setTimeout(async () => {
            try {
                const data = await fetcher(query.trim());
                if (seq !== requestSeq.current) return;
                setOptions(data);
                setOpen(true);
                setHighlighted(data.length > 0 ? 0 : -1);
            } catch (err) {
                console.error('Autocomplete fetcher error:', err);
                setOptions([]);
            } finally {
                if (seq === requestSeq.current) setLoading(false);
            }
        }, debounceMs);
        return () => clearTimeout(t);
    }, [query, minChars, debounceMs, fetcher]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selectOption = (opt: T) => {
        onSelect(opt);
        if (getOptionLabel) setQuery(getOptionLabel(opt));
        setOpen(false);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || options.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => (h - 1 + options.length) % options.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted >= 0 && highlighted < options.length) {
                selectOption(options[highlighted]);
            }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.trim().length >= minChars && setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className={inputClassName || 'input-field'}
            />
            {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div
                        className="h-4 w-4 rounded-full border-2 border-t-transparent"
                        style={{
                            borderColor: 'var(--accent)',
                            borderTopColor: 'transparent',
                            animation: 'spin-soft 800ms linear infinite',
                        }}
                    />
                </div>
            )}
            {open && options.length > 0 && (
                <div
                    className="absolute z-50 left-0 right-0 mt-1.5 max-h-72 overflow-y-auto surface-raised"
                    style={{ padding: '4px' }}
                >
                    {options.map((opt, i) => (
                        <div
                            key={i}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectOption(opt);
                            }}
                            onMouseEnter={() => setHighlighted(i)}
                            className="px-3 py-2 cursor-pointer text-[13px] rounded transition-colors"
                            style={{
                                background: i === highlighted ? 'var(--accent-soft)' : 'transparent',
                                color: 'var(--ink)',
                            }}
                        >
                            {renderOption(opt, i === highlighted)}
                        </div>
                    ))}
                </div>
            )}
            {open && !loading && options.length === 0 && query.trim().length >= minChars && (
                <div
                    className="absolute z-50 left-0 right-0 mt-1.5 px-4 py-3 surface-raised text-[13px] italic"
                    style={{ color: 'var(--ink-faint)' }}
                >
                    Sin coincidencias para «{query}»
                </div>
            )}
        </div>
    );
}
