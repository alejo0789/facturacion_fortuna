import type { ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    onSubmit?: () => void;
    submitLabel?: string;
    submitText?: string;
    submitDisabled?: boolean;
}

export default function Modal({ isOpen, onClose, title, children, onSubmit, submitLabel = 'Guardar', submitText, submitDisabled }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className="relative w-full max-w-lg transform rounded-2xl bg-white shadow-2xl transition-all
                               animate-in fade-in zoom-in-95 duration-200"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5">
                        {children}
                    </div>

                    {/* Footer */}
                    {onSubmit && (
                        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-4 rounded-b-2xl">
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={onSubmit}
                                disabled={submitDisabled}
                                className={`px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg shadow-blue-500/25 transition-all ${submitDisabled
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:from-blue-700 hover:to-indigo-700'
                                    }`}
                            >
                                {submitText || submitLabel}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Reusable Form Field Component
export function FormField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
        </div>
    );
}

// Enhanced Input Style
export const inputClassName = `
    w-full px-4 py-2.5 
    bg-gray-50 border border-gray-200 rounded-xl 
    text-gray-900 placeholder-gray-400
    focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 
    transition-all duration-200 outline-none
`;
