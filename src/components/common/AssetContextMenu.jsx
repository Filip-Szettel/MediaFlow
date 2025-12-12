import React, { useRef, useLayoutEffect } from 'react';
import { RefreshCw, Download, Trash2, Archive, Zap } from 'lucide-react';
import { API_URL } from '../../constants';

export default function AssetContextMenu({
    contextMenu,
    setContextMenu,
    selectedItems,
    library,
    activeTab,
    setConvertModalTargets,
    handleRestoreAsset,
    handleDeleteAsset,
    handleArchiveAsset,
    addToast,
    handleArchiveDeleteFlow,
    apiCall
}) {
    if (!contextMenu) return null;

    const menuRef = useRef(null);

    useLayoutEffect(() => {
        if (menuRef.current && contextMenu) {
            const rect = menuRef.current.getBoundingClientRect();
            const { innerWidth, innerHeight } = window;

            let top = contextMenu.y;
            let left = contextMenu.x;

            // Check bottom overflow
            if (top + rect.height > innerHeight) {
                top = Math.max(0, top - rect.height);
            }

            // Check right overflow
            if (left + rect.width > innerWidth) {
                left = Math.max(0, left - rect.width);
            }

            menuRef.current.style.top = `${top}px`;
            menuRef.current.style.left = `${left}px`;
        }
    }, [contextMenu]);

    return (
        <>
            <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div
                ref={menuRef}
                className="fixed z-[100] min-w-[220px] bg-theme-panel backdrop-blur-xl border border-theme rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
                style={{ top: contextMenu.y, left: contextMenu.x }}
            >
                {(() => {
                    const targets = (contextMenu.asset && !selectedItems.has(contextMenu.asset._id))
                        ? [contextMenu.asset]
                        : Array.from(selectedItems).map(id => (library || []).find(a => a._id === id)).filter(Boolean);
                    const count = targets.length;
                    const isMulti = count > 1;

                    return (
                        <div className="flex flex-col gap-0.5">
                            <button
                                onClick={() => {
                                    setConvertModalTargets(targets);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-theme-secondary/20 rounded-md flex items-center gap-2 transition-colors"
                            >
                                <Zap size={14} /> {isMulti ? `Konwertuj (${count})` : 'Konwertuj'}
                            </button>

                            <div className="h-px bg-white/10 my-1"></div>

                            {activeTab === 'archive' ? (
                                <>
                                    <button
                                        onClick={() => { handleRestoreAsset(targets); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-emerald-600 hover:text-white rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <RefreshCw size={14} /> {isMulti ? `Przywróć (${count})` : 'Przywróć'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            addToast(isMulti ? 'Pobieranie paczki ZIP...' : 'Pobieranie...', 'info');
                                            setContextMenu(null);
                                            try {
                                                // Single File Download - DIRECT
                                                if (!isMulti) {
                                                    const target = targets[0];
                                                    // Use direct stream download link
                                                    const url = `${API_URL}/stream/${target._id}?download=true`;
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    // If version, use correct extension from container or path
                                                    const ext = target.container || (target.path ? target.path.split('.').pop() : 'dat');
                                                    const name = target.originalName || `download.${ext}`;
                                                    a.download = name; // Browser might ignore this for cross-origin but for same-origin it helps
                                                    document.body.appendChild(a); a.click(); a.remove();
                                                } else {
                                                    // Batch ZIP Download
                                                    const ids = targets.map(t => t._id);
                                                    const name = `archive_batch_${Date.now()}.zip`;
                                                    const blob = await apiCall('/download-zip', 'POST', { ids });
                                                    const url = window.URL.createObjectURL(blob);
                                                    const a = document.createElement('a'); a.href = url; a.download = name;
                                                    document.body.appendChild(a); a.click(); a.remove();
                                                }

                                                handleArchiveDeleteFlow(targets);
                                            } catch (e) { addToast("Błąd pobierania", 'error'); }
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-violet-600 hover:text-white rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <Download size={14} /> {isMulti ? `Pobierz i Usuń (${count})` : 'Pobierz i Usuń'}
                                    </button>
                                    <button
                                        onClick={() => { handleDeleteAsset(targets); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <Trash2 size={14} /> {isMulti ? `Usuń Trwale (${count})` : 'Usuń Trwale'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => { handleArchiveAsset(targets); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-sm text-amber-200 hover:bg-amber-600/20 hover:text-amber-100 rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <Archive size={14} /> {isMulti ? `Do Archiwum (${count})` : 'Do Archiwum'}
                                    </button>
                                    <div className="h-px bg-white/10 my-1"></div>
                                    <button
                                        onClick={() => { handleDeleteAsset(targets); setContextMenu(null); }}
                                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-md flex items-center gap-2 transition-colors"
                                    >
                                        <Trash2 size={14} /> {isMulti ? `Usuń (${count})` : 'Usuń'}
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })()}
            </div >
        </>
    );
}
