import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;

    const sizes = {
        sm: 'max-w-md',
        md: 'max-w-2xl',
        lg: 'max-w-4xl',
        xl: 'max-w-6xl'
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className={`glass-panel w-full ${sizes[size]} rounded-2xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl ring-1 ring-white/10 animate-slide-up`}>
                <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">{title}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1 relative">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;
