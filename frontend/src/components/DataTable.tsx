import type { ReactNode } from 'react';

interface Column<T> {
    key: keyof T | string;
    header: string;
    render?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    onEdit?: (item: T) => void;
    onDelete?: (item: T) => void;
    loading?: boolean;
}

export default function DataTable<T extends { id: number }>({
    data,
    columns,
    onEdit,
    onDelete,
    loading,
}: DataTableProps<T>) {
    if (loading) {
        return (
            <div className="surface p-10 text-center">
                <div
                    className="h-8 w-8 mx-auto rounded-full border-2 border-t-transparent"
                    style={{
                        borderColor: 'var(--accent)',
                        borderTopColor: 'transparent',
                        animation: 'spin-soft 800ms linear infinite',
                    }}
                />
                <div className="kicker mt-3">Cargando</div>
            </div>
        );
    }

    return (
        <div className="surface-raised overflow-hidden">
            <table className="w-full">
                <thead style={{ background: 'var(--paper-tinted)' }}>
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={String(col.key)}
                                className="kicker px-5 py-3 text-left"
                                style={{ background: 'var(--paper-tinted)' }}
                            >
                                {col.header}
                            </th>
                        ))}
                        {(onEdit || onDelete) && (
                            <th
                                className="kicker px-5 py-3 text-right"
                                style={{ background: 'var(--paper-tinted)' }}
                            >
                                Acciones
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + 1} className="px-6 py-16 text-center">
                                <div
                                    className="font-display text-[2.5rem]"
                                    style={{ color: 'var(--ink-mute)', fontVariationSettings: "'SOFT' 100, 'WONK' 1" }}
                                >
                                    —
                                </div>
                                <div className="kicker mt-2">Sin registros</div>
                            </td>
                        </tr>
                    ) : (
                        data.map((item, idx) => (
                            <tr
                                key={item.id}
                                style={{ borderTop: idx > 0 ? '1px solid var(--rule-soft)' : 'none' }}
                                className="transition-colors"
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--paper-tinted)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                {columns.map((col) => (
                                    <td
                                        key={String(col.key)}
                                        className="px-5 py-3 text-[13.5px]"
                                        style={{ color: 'var(--ink)' }}
                                    >
                                        {col.render
                                            ? col.render(item)
                                            : String((item as Record<string, unknown>)[col.key as string] ?? '—')}
                                    </td>
                                ))}
                                {(onEdit || onDelete) && (
                                    <td className="px-5 py-3 text-right space-x-3">
                                        {onEdit && (
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="text-[12px] font-medium transition-colors"
                                                style={{ color: 'var(--accent)' }}
                                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-vivid)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                                            >
                                                Editar
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                onClick={() => onDelete(item)}
                                                className="text-[12px] font-medium transition-colors"
                                                style={{ color: 'var(--negative)' }}
                                            >
                                                Eliminar
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
