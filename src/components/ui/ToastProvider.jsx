import React, { createContext, useContext, useState, useCallback } from 'react';
import { XCircle, CheckCircle, Info, X } from 'lucide-react';

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 5000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto min-w-[320px] max-w-[400px] p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-4 animate-slide-up transition-all ${toast.type === 'error' ? 'bg-red-950/80 border-red-500/30 text-red-200' :
                                toast.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200' :
                                    'bg-violet-950/80 border-violet-500/30 text-violet-200'
                            }`}
                    >
                        {toast.type === 'error' ? <XCircle className="shrink-0 text-red-400" size={24} /> :
                            toast.type === 'success' ? <CheckCircle className="shrink-0 text-emerald-400" size={24} /> :
                                <Info className="shrink-0 text-violet-400" size={24} />}
                        <div className="flex-1 text-sm font-medium leading-relaxed">{toast.message}</div>
                        <button onClick={() => removeToast(toast.id)} className="hover:opacity-70"><X size={16} /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => useContext(ToastContext);
