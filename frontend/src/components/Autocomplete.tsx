/**
 * Autocomplete — componente genérico de búsqueda incremental.
 *
 * Características:
 *   - Debouncing automático (300 ms) — no satura el backend mientras escribís.
 *   - Renderiza un dropdown bajo el input con las coincidencias.
 *   - Navegación con teclado (↑/↓/Enter/Esc).
 *   - Render personalizable de cada opción (prop `renderOption`).
 *   - Funciona con cualquier fuente: pasás una función `fetcher(query)` que
 *     devuelve una promesa con la lista.
 *
 * Pensado para reusar en:
 *   - PUCPage → añadir cuenta desde el catálogo Decreto 2650 (428 opciones).
 *   - UploadFacturaModal → escoger concepto DIAN de retención (50 opciones).
 *   - Cualquier otro lugar donde haya una lista larga + búsqueda.
 */
import { useEffect, useRef, useState } from 'react';

export interface AutocompleteProps<T> {
    /** Función que llama al backend y devuelve la lista filtrada. */
    fetcher: (query: string) => Promise<T[]>;
    /** Callback cuando el usuario selecciona una opción. */
    onSelect: (option: T) => void;
    /** Render personalizado de cada item en la lista. */
    renderOption: (option: T, isHighlighted: boolean) => React.ReactNode;
    /** Texto que aparece en el input cuando una opción ya está seleccionada. */
    getOptionLabel?: (option: T) => string;
    /** Valor inicial del input (texto). */
    initialValue?: string;
    placeholder?: string;
    /** Mínimo de caracteres antes de empezar a buscar (default 1). */
    minChars?: number;
    /** Debounce en ms (default 300). */
    debounceMs?: number;
    /** Auto-foco al montar. */
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

    // Fetch con debounce — sólo si query ≥ minChars
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
                if (seq !== requestSeq.current) return; // descartar respuesta vieja
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

    // Cerrar al click fuera
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
                className={
                    inputClassName ||
                    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none'
                }
            />
            {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
            )}
            {open && options.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    {options.map((opt, i) => (
                        <div
                            key={i}
                            onMouseDown={(e) => {
                                // mousedown (no click) para evitar el blur que cierra el dropdown
                                e.preventDefault();
                                selectOption(opt);
                            }}
                            onMouseEnter={() => setHighlighted(i)}
                            className={`px-3 py-2 cursor-pointer text-sm border-b last:border-b-0 ${
                                i === highlighted ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                            }`}
                        >
                            {renderOption(opt, i === highlighted)}
                        </div>
                    ))}
                </div>
            )}
            {open && !loading && options.length === 0 && query.trim().length >= minChars && (
                <div className="absolute z-50 left-0 right-0 mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-lg text-sm text-gray-500 italic">
                    Sin coincidencias para «{query}»
                </div>
            )}
        </div>
    );
}
