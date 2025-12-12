import React, { useRef } from 'react';
import { Upload, Trash2, Film, File, X, UploadCloud, Loader, AlertTriangle } from 'lucide-react';
import { formatBytes } from '../../utils';
import { useSettings } from '../../context/SettingsContext';

export default function UploadView({
    pendingFiles,
    setPendingFiles,
    uploading,
    uploadFiles,
    storageMetrics
}) {
    const fileInputRef = useRef(null);
    const { userSettings } = useSettings();

    const pendingSize = pendingFiles.reduce((acc, f) => acc + f.size, 0);
    const totalUsed = storageMetrics ? storageMetrics.total : 0;
    const quota = userSettings.quotaBytes;
    const isOverQuota = (totalUsed + pendingSize) > quota;
    const remaining = quota - totalUsed;

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setPendingFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    return (
        <div className="h-full p-8 animate-slide-up flex flex-col">
            {/* Hidden Input for Click-to-Upload */}
            <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
            />

            <div
                onClick={() => pendingFiles.length === 0 && fileInputRef.current?.click()}
                className={`flex-1 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center relative overflow-hidden group transition-all duration-500
                ${pendingFiles.length === 0
                        ? 'border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 hover:border-violet-500/60 hover:from-violet-500/10 hover:to-fuchsia-500/10 cursor-pointer'
                        : 'border-theme/30 bg-theme-panel/30 hover:border-theme-accent/50'
                    }`}
            >
                {pendingFiles.length === 0 ? (
                    <div className="text-center transform transition-transform duration-500 group-hover:scale-105 pointer-events-none">
                        <div className="w-32 h-32 bg-violet-600/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-violet-500/20 shadow-[0_0_30px_rgba(139,92,246,0.2)] animate-pulse-ring relative group-hover:shadow-[0_0_50px_rgba(139,92,246,0.4)] transition-shadow">
                            <div className="absolute inset-0 rounded-full border border-violet-400/30 animate-[spin_10s_linear_infinite] opacity-50"></div>
                            <Upload className="text-violet-400 drop-shadow-[0_0_10px_rgba(139,92,246,0.5)]" size={48} />
                        </div>
                        <h2 className="text-5xl font-bold text-theme-primary mb-4 tracking-tight drop-shadow-lg">
                            Upuść pliki <span className="text-violet-400">tutaj</span>
                        </h2>
                        <p className="text-theme-secondary/70 max-w-md mx-auto text-lg">
                            lub kliknij, aby otworzyć eksplorator plików.<br />
                            <span className="text-sm mt-2 block opacity-50">Obsługujemy wideo, audio i obrazy</span>
                        </p>
                    </div>
                ) : (
                    <div className="w-full h-full p-8 flex flex-col max-w-6xl mx-auto cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-3xl font-bold text-theme-primary flex items-center gap-3">
                                    <div className="p-2 bg-violet-500/20 rounded-lg">
                                        <Upload className="text-violet-400" size={24} />
                                    </div>
                                    Kolejka Uploadu
                                </h2>
                                <p className="text-theme-secondary mt-1 ml-1">{pendingFiles.length} plików gotowych do wysłania</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-xl border border-theme hover:bg-theme-panel text-theme-secondary hover:text-theme-primary transition-colors text-sm font-bold">
                                    + Dodaj więcej
                                </button>
                                <button onClick={() => setPendingFiles([])} className="px-4 py-2 rounded-xl border border-red-500/20 hover:bg-red-500/10 text-red-400 transition-colors text-sm font-bold flex items-center gap-2">
                                    <Trash2 size={16} /> Wyczyść
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min content-start pb-4">
                            {pendingFiles.map((f, i) => (
                                <div key={i} className="glass-panel p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in relative overflow-hidden group hover:border-violet-500/30 transition-colors">
                                    <div className="w-16 h-16 bg-black/40 rounded-xl flex items-center justify-center border border-white/5 shrink-0 overflow-hidden relative">
                                        {f.type.startsWith('image/') ? (
                                            <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
                                        ) : f.type.includes('video') ? <Film className="text-violet-400" size={28} /> : <File className="text-cyan-400" size={28} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-theme-primary truncate">{f.name}</div>
                                        <div className="text-xs text-theme-secondary flex items-center gap-2 mt-1">
                                            <span className="font-mono text-violet-300">{formatBytes(f.size)}</span>
                                            <span className="w-1 h-1 rounded-full bg-theme-secondary/20"></span>
                                            <span className="uppercase tracking-wider">{f.name.split('.').pop()}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-2 hover:bg-red-500/20 text-theme-secondary hover:text-red-400 rounded-lg transition-colors"><X size={18} /></button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex flex-col gap-4 p-6 glass-panel rounded-2xl border-t border-theme shadow-2xl bg-gradient-to-r from-violet-900/10 to-transparent">
                            <div className="flex justify-between items-end">
                                <div className="text-theme-secondary">
                                    Całkowity rozmiar: <span className={`font-bold text-lg ml-2 ${isOverQuota ? 'text-red-400' : 'text-theme-primary'}`}>{formatBytes(pendingSize)}</span>
                                    {isOverQuota && <span className="text-red-400 text-xs font-bold ml-2 flex items-center gap-1 inline-flex"><AlertTriangle size={12} /> Przekroczono limit!</span>}
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-theme-secondary mb-1">Dostępne miejsce: {formatBytes(Math.max(0, remaining))}</div>
                                    <div className="w-48 h-2 bg-theme-panel rounded-full overflow-hidden">
                                        <div className={`h-full ${isOverQuota ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(((totalUsed + pendingSize) / quota) * 100, 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={uploadFiles}
                                disabled={uploading || isOverQuota}
                                className={`w-full py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-3 text-lg transition-all
                                    ${uploading || isOverQuota
                                        ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-violet-600/40 active:scale-95'}`}
                            >
                                {uploading ? <><Loader size={24} className="animate-spin" /> Wysyłanie...</>
                                    : isOverQuota ? <><AlertTriangle size={24} /> Brak miejsca na dysku</>
                                        : <><UploadCloud size={24} /> Wyślij na serwer</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
