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
    loading
}: DataTableProps<T>) {
    if (loading) {
        return <div className="text-center py-10">Loading...</div>;
    }

    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
            <table className="w-full">
                <thead className="bg-slate-50 border-b border-gray-200">
                    <tr>
                        {columns.map(col => (
                            <th key={String(col.key)} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {col.header}
                            </th>
                        ))}
                        {(onEdit || onDelete) && (
                            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {data.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length + 1} className="px-6 py-10 text-center text-gray-500">
                                No data found.
                            </td>
                        </tr>
                    ) : (
                        data.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                {columns.map(col => (
                                    <td key={String(col.key)} className="px-6 py-4 text-sm text-gray-700">
                                        {col.render
                                            ? col.render(item)
                                            : String((item as Record<string, unknown>)[col.key as string] ?? '-')}
                                    </td>
                                ))}
                                {(onEdit || onDelete) && (
                                    <td className="px-6 py-4 text-right space-x-2">
                                        {onEdit && (
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {onDelete && (
                                            <button
                                                onClick={() => onDelete(item)}
                                                className="text-red-600 hover:text-red-800 font-medium text-sm"
                                            >
                                                Delete
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
