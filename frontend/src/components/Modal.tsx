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
        <div className="fixed inset-0 z-50 overflow-y-auto anim-fade-in">
            <div
                className="fixed inset-0"
                style={{ background: 'rgba(11, 15, 25, 0.55)', backdropFilter: 'blur(4px)' }}
                onClick={onClose}
            />
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative w-full max-w-lg surface-raised anim-fade-up overflow-hidden">
                    <div
                        className="flex items-center justify-between px-6 py-4"
                        style={{ borderBottom: '1px solid var(--rule)' }}
                    >
                        <div>
                            <div className="kicker-accent mb-1">Acción</div>
                            <h2 className="font-display text-[1.25rem] tracking-tight" style={{ fontVariationSettings: "'SOFT' 30" }}>
                                {title}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-md p-2 transition-colors"
                            style={{ color: 'var(--ink-mute)' }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'var(--ink)';
                                e.currentTarget.style.background = 'var(--canvas-2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--ink-mute)';
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="px-6 py-5">{children}</div>

                    {onSubmit && (
                        <div
                            className="flex justify-end gap-2 px-6 py-4"
                            style={{
                                borderTop: '1px solid var(--rule)',
                                background: 'var(--paper-tinted)',
                            }}
                        >
                            <button onClick={onClose} className="btn-ghost">
                                Cancelar
                            </button>
                            <button
                                onClick={onSubmit}
                                disabled={submitDisabled}
                                className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
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

export function FormField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
    return (
        <div className="space-y-1.5">
            <label className="kicker block">
                {label}
                {required && <span style={{ color: 'var(--negative)', marginLeft: '4px' }}>*</span>}
            </label>
            {children}
        </div>
    );
}

export const inputClassName = 'input-field';
