import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import {
    Upload, Database, Settings, Archive, ShieldCheck, LogOut, Activity, X, Download, MonitorDown
} from 'lucide-react';
import { API_URL, AUTH_TOKEN } from '../constants';
import { fetcher, apiCall } from '../api';
import { getAssetSize, formatBytes } from '../utils';
import { useToast } from './ui/ToastProvider';
import Modal from './ui/Modal';
import NavItem from './NavItem';
import AdminPanel from './AdminPanel';
import ConversionWizard from './ConversionWizard';
import ConversionStatusPanel from './ConversionStatusPanel';
import { usePWAInstall } from '../hooks/usePWAInstall';

// NEW COMPONENTS
import LibraryView from './views/LibraryView';
import AssetDetailView from './views/AssetDetailView';
import UploadView from './views/UploadView';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { useNavState } from '../hooks/useNavState';
import { AlertTriangle, Info } from 'lucide-react';
import SettingsView from './views/SettingsView';
import AssetContextMenu from './common/AssetContextMenu';

// --- TRANSLATIONS (Keep locally or move to separate file later) ---
const translations = {
    pl: {
        nav: { upload: 'Prześlij pliki', library: 'Biblioteka', archive: 'Archiwum', admin: 'Panel Admina', settings: 'Konfiguracja', workspace: 'Obszar Roboczy', administration: 'Administracja' },
        settings: { title: 'Konfiguracja Systemu', desc: 'Dostosuj wygląd i język aplikacji.', theme: 'Motyw', themeLight: 'Jasny', themeDark: 'Ciemny', lang: 'Język', langPL: 'Polski', langEN: 'English' },
        common: { libraryEmpty: 'Biblioteka jest pusta. Prześlij pierwsze pliki.', dragDrop: 'Upuść pliki tutaj', uploadQueue: 'Kolejka Uploadu', clearAll: 'Wyczyść wszystko', send: 'Wyślij na serwer', sending: 'Wysyłanie danych...' },
        cols: { preview: 'Podgląd', name: 'Nazwa', size: 'Rozmiar', type: 'Rodzaj', format: 'Format', created: 'Utworzono' },
        filters: { all: 'Wszystkie', image: 'Obrazy', video: 'Wideo', audio: 'Audio', format: 'Format' }
    },
    en: {
        nav: { upload: 'Upload Files', library: 'Library', archive: 'Archive', admin: 'Admin Panel', settings: 'Settings', workspace: 'Workspace', administration: 'Administration' },
        settings: { title: 'System Configuration', desc: 'Customize application appearance and language.', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', lang: 'Language', langPL: 'Polski', langEN: 'English' },
        common: { libraryEmpty: 'Library is empty. Upload your first files.', dragDrop: 'Drop files here', uploadQueue: 'Upload Queue', clearAll: 'Clear All', send: 'Send to Server', sending: 'Sending data...' },
        cols: { preview: 'Preview', name: 'Name', size: 'Size', type: 'Type', format: 'Format', created: 'Created' },
        filters: { all: 'All', image: 'Images', video: 'Video', audio: 'Audio', format: 'Format' }
    }
};

const InnerAppContent = () => {
    const { systemSettings, userSettings, updateUserSettings } = useSettings();
    const { addToast } = useToast();
    const { deferredPrompt, promptInstall } = usePWAInstall();

    // --- SETTINGS STATE (now managed by context) ---
    // The useEffect below handles body class updates based on context.


    useEffect(() => {
        // Update local storage and theme class based on userSettings from context
        if (userSettings) {
            localStorage.setItem('mf_settings', JSON.stringify(userSettings));
            if (userSettings.theme === 'light') {
                document.body.classList.add('light-theme');
            } else {
                document.body.classList.remove('light-theme');
            }
        }
    }, [userSettings]); // Depend on userSettings from context

    const t = (key) => {
        const keys = key.split('.');
        let val = translations[userSettings?.language || 'pl']; // Use userSettings.language
        for (const k of keys) val = val?.[k];
        return val || key;
    };

    // --- NAVIGATION STATE ---
    const { activeTab, currentFolder, navigateTo, viewMode, setViewMode } = useNavState();
    const [dragActive, setDragActive] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [activeJobs, setActiveJobs] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('newest');
    const [filterType, setFilterType] = useState('all');
    const [filterFormat, setFilterFormat] = useState('all');

    const [convertModalTargets, setConvertModalTargets] = useState([]);
    const [selectedVersions, setSelectedVersions] = useState(new Set());
    const [activeMetadataSource, setActiveMetadataSource] = useState(null);
    const [playerAsset, setPlayerAsset] = useState(null);

    useEffect(() => {
        setActiveMetadataSource(null);
        setSelectedVersions(new Set());
    }, [currentFolder]);

    const [librarySelection, setLibrarySelection] = useState(new Set());
    const [archiveSelection, setArchiveSelection] = useState(new Set());

    const selectedItems = useMemo(() => activeTab === 'archive' ? archiveSelection : librarySelection, [activeTab, librarySelection, archiveSelection]);
    const selectionMode = selectedItems.size > 0;

    const setSelectedItems = useCallback((action) => {
        const update = (prev) => {
            const newVal = (typeof action === 'function') ? action(prev) : action;
            return newVal;
        };
        if (activeTab === 'archive') setArchiveSelection(update);
        else setLibrarySelection(update);
    }, [activeTab]);

    const [contextMenu, setContextMenu] = useState(null);
    const [confirmationModal, setConfirmationModal] = useState({ isOpen: false, title: '', description: '', onConfirm: null, variant: 'danger' });

    const { data: library, mutate } = useSWR(`${API_URL}/library`, fetcher);

    useEffect(() => {
        const evtSource = new EventSource(`${API_URL}/events`);
        evtSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'progress') {
                    setActiveJobs(prev => ({ ...prev, [data.id]: { percent: data.percent, status: 'processing', eta: data.eta } }));
                } else if (data.type === 'complete') {
                    setActiveJobs(prev => { const ns = { ...prev }; delete ns[data.id]; return ns; });
                    mutate();
                    addToast(`Zadanie zakończone: ${data.doc?.originalName || 'Plik'}`, 'success');
                } else if (data.type === 'error') {
                    addToast(`Błąd przetwarzania: ${data.error}`, 'error');
                    setActiveJobs(prev => { const ns = { ...prev }; delete ns[data.id]; return ns; });
                    mutate();
                }
            } catch (e) { console.error('SSE Error', e); }
        };
        return () => evtSource.close();
    }, [mutate, addToast]);

    const handleDrag = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave" && e.relatedTarget === null) setDragActive(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.length > 0) {
            setPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
            navigateTo('upload');
        }
    }, [navigateTo]);

    const uploadFiles = async () => {
        setUploading(true);
        let successCount = 0;
        for (const file of pendingFiles) {
            const fd = new FormData();
            fd.append('file', file);
            try {
                await fetch(`${API_URL}/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
                    body: fd
                });
                successCount++;
                setPendingFiles(prev => prev.filter(f => f !== file));
            } catch (e) {
                console.error(e);
                addToast(`Błąd wysyłania ${file.name}`, 'error');
            }
        }
        setUploading(false);
        if (pendingFiles.length === 0) navigateTo('library');
        mutate();
        if (successCount > 0) addToast(`Pomyślnie przesłano ${successCount} plików`, 'success');
    };

    const processedLibrary = useMemo(() => {
        if (!library) return [];
        let result = library.filter(asset => asset.originalName.toLowerCase().includes(searchQuery.toLowerCase()));

        if (filterType !== 'all') {
            result = result.filter(asset => {
                if (filterType === 'image') return asset.mimetype.startsWith('image/');
                if (filterType === 'video') return asset.mimetype.startsWith('video/');
                if (filterType === 'audio') return asset.mimetype.startsWith('audio/');
                return true;
            });
        }
        if (filterFormat !== 'all') {
            result = result.filter(asset => {
                const ext = asset.path.split('.').pop().toLowerCase();
                return ext === filterFormat.toLowerCase();
            });
        }

        if (activeTab === 'archive') {
            result = result.filter(a => a.archived);
        } else {
            result = result.filter(a => !a.archived);
        }

        return result.sort((a, b) => {
            if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (sortOrder === 'name') return a.originalName.localeCompare(b.originalName);
            if (sortOrder === 'size') return getAssetSize(b) - getAssetSize(a);
            if (sortOrder === 'duration') {
                const durA = a.probe?.duration || a.probe?.format?.duration || 0;
                const durB = b.probe?.duration || b.probe?.format?.duration || 0;
                return durB - durA; // Longest first
            }
            return 0;
        });
    }, [library, searchQuery, activeTab, sortOrder, filterType, filterFormat]);


    const storageMetrics = useMemo(() => {
        if (!library) return { source: 0, versions: 0, total: 0 };
        return library.reduce((acc, asset) => {
            const sourceSize = getAssetSize(asset);
            const versionsSize = asset.generatedVersions ? asset.generatedVersions.reduce((vAcc, v) => vAcc + getAssetSize(v), 0) : 0;
            return {
                source: acc.source + sourceSize,
                versions: acc.versions + versionsSize,
                total: acc.total + sourceSize + versionsSize
            };
        }, { source: 0, versions: 0, total: 0 });
    }, [library]);

    const handleSelectAll = useCallback(() => {
        if (selectedItems.size === processedLibrary.length && processedLibrary.length > 0) {
            setSelectedItems(new Set());
            addToast('Odznaczono wszystkie pliki', 'info', 2000);
        } else {
            const allIds = new Set(processedLibrary.map(asset => asset._id));
            setSelectedItems(allIds);
            addToast(`Zaznaczono wszystkie pliki (${processedLibrary.length})`, 'info', 2000);
        }
    }, [processedLibrary, selectedItems, addToast, setSelectedItems]);

    const toggleSelection = (id) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedItems(newSet);
    };

    const handleArchiveAsset = async (assets) => {
        const targets = Array.isArray(assets) ? assets : [assets];
        try {
            for (const asset of targets) await apiCall(`/assets/${asset._id}`, 'PATCH', { archived: true });
            mutate();
            addToast(`Przeniesiono do archiwum (${targets.length})`, 'success');
            if (targets.length > 1 || selectionMode) setSelectedItems(new Set());
        } catch (e) { addToast('Błąd archiwizacji', 'error'); }
    };

    const handleRestoreAsset = async (assets) => {
        const targets = Array.isArray(assets) ? assets : [assets];
        try {
            for (const asset of targets) await apiCall(`/assets/${asset._id}`, 'PATCH', { archived: false });
            mutate();
            addToast(`Przywrócono z archiwum (${targets.length})`, 'success');
            if (targets.length > 1 || selectionMode) setSelectedItems(new Set());
        } catch (e) { addToast('Błąd przywracania', 'error'); }
    };

    const handleDeleteAsset = async (assets) => {
        const targets = Array.isArray(assets) ? assets : [assets];
        const isOne = targets.length === 1;
        const asset = targets[0];
        const isPermanent = asset.archived; // simplified check
        let title = isPermanent ? "Trwałe usuwanie" : "Usuwanie";
        let desc = "";

        if (isOne) {
            title = isPermanent ? "Trwałe usuwanie" : "Usuwanie pliku";
            desc = isPermanent
                ? `Czy na pewno chcesz usunąć TRWALE plik "${asset.originalName}"? Operacji nie można cofnąć.`
                : `Czy na pewno usunąć plik "${asset.originalName}"? Plik trafi do kosza (jeśli zaimplementowany) lub zostanie usunięty.`;
        } else {
            title = isPermanent ? `Trwałe usuwanie (${targets.length})` : `Usuwanie plików (${targets.length})`;
            desc = isPermanent
                ? `Czy na pewno chcesz usunąć TRWALE ${targets.length} plików?`
                : `Czy na pewno usunąć ${targets.length} plików?`;
        }

        setConfirmationModal({
            isOpen: true, title, description: desc, variant: 'danger',
            onConfirm: async () => {
                try {
                    for (const t of targets) await apiCall(`/assets/${t._id}`, 'DELETE');
                    mutate();
                    addToast(`Usunięto ${targets.length} plików`, 'success');
                    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                    setSelectedItems(new Set());
                } catch (e) { addToast('Błąd usuwania', 'error'); }
            }
        });
    };

    const handleArchiveDeleteFlow = async (assets) => {
        const targets = Array.isArray(assets) ? assets : [assets];
        const isOne = targets.length === 1;
        setConfirmationModal({
            isOpen: true,
            title: isOne ? "Pobrano plik. Usunąć trwale?" : "Pobrano pliki. Usunąć trwale?",
            description: isOne
                ? `Plik "${targets[0].originalName}" został pobrany. Czy chcesz go teraz usunąć z serwera na zawsze?`
                : `Pobrano ${targets.length} plików. Czy chcesz je teraz usunąć z serwera na zawsze?`,
            variant: 'danger', confirmText: "Usuń Trwale",
            onConfirm: async () => {
                try {
                    for (const t of targets) await apiCall(`/assets/${t._id}`, 'DELETE');
                    mutate();
                    addToast('Usunięto trwale', 'info');
                    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                    setSelectedItems(new Set());
                } catch (e) { addToast('Błąd', 'error'); }
            }
        });
    };

    const handleBulkConversionRequest = async (config) => {
        if (!convertModalTargets || convertModalTargets.length === 0) return;
        let started = 0;
        setConvertModalTargets([]);
        for (const asset of convertModalTargets) {
            try {
                await apiCall('/convert', 'POST', { assetId: asset._id, config });
                started++;
            } catch (e) { addToast(`Błąd przy ${asset.originalName}: ${e.message}`, 'error'); }
        }
        mutate();
        if (started > 0) {
            addToast(`Zlecono konwersję dla ${started} plików.`, 'success');
            setSelectedItems(new Set());
        }
    };

    const handleBulkDownload = async () => {
        try {
            addToast('Generowanie archiwum ZIP (Streaming)...', 'info');
            const blob = await apiCall('/download-zip', 'POST', { ids: Array.from(selectedItems) });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `mediaflow_export_${Date.now()}.zip`;
            document.body.appendChild(a); a.click(); a.remove();
            setSelectedItems(new Set());
            addToast('Pobieranie rozpoczęte', 'success');
        } catch (e) { addToast("Błąd pobierania ZIP", 'error'); }
    };

    const handleVersionBulkAction = async (action, forcedId = null) => {
        const idsToProcess = forcedId ? [forcedId] : Array.from(selectedVersions);
        if (idsToProcess.length === 0) return;

        if (action === 'download') {
            addToast('Pobieranie wersji...', 'info');
            try {
                if (idsToProcess.length === 1) {
                    const vid = idsToProcess[0];
                    const url = `${API_URL}/stream/${vid}?download=true`; // Assuming backend handles this
                    const a = document.createElement('a'); a.href = url; a.download = `version_${vid}.dat`;
                    document.body.appendChild(a); a.click(); a.remove();
                    addToast('Pobieranie rozpoczęte', 'success');
                } else {
                    const blob = await apiCall('/download-zip', 'POST', { ids: idsToProcess });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `versions_export_${Date.now()}.zip`;
                    document.body.appendChild(a); a.click(); a.remove();
                    addToast('Pobieranie rozpoczęte', 'success');
                }
                if (!forcedId) setSelectedVersions(new Set());
            } catch (e) { addToast("Błąd pobierania", "error"); }
        } else if (action === 'delete') {
            if (!confirm(`Czy na pewno usunąć ${idsToProcess.length} wersji?`)) return;
            for (const vid of idsToProcess) {
                try { await apiCall(`/assets/${vid}`, 'DELETE'); } catch (e) { console.error(e); }
            }
            mutate();
            if (!forcedId) setSelectedVersions(new Set());
            addToast('Usunięto wybrane wersje', 'info');
        }
    };

    const toggleVersionSelection = (id) => {
        const newSet = new Set(selectedVersions);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedVersions(newSet);
    };

    const openBatchWizard = () => {
        const selectedAssets = processedLibrary.filter(asset => selectedItems.has(asset._id));
        if (selectedAssets.length === 0) return;
        setConvertModalTargets(selectedAssets);
    };

    return (
        <div className="flex h-screen w-full bg-theme-main text-theme-primary font-sans" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>

            {/* Maintenance Mode Overlay */}
            {systemSettings?.maintenanceMode && (
                <div className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-lg flex flex-col items-center justify-center text-white p-8 text-center">
                    <AlertTriangle size={64} className="text-red-500 mb-6 animate-pulse" />
                    <h2 className="text-4xl font-bold mb-4">Tryb Konserwacji</h2>
                    <p className="text-xl text-gray-300 max-w-2xl">
                        Przepraszamy za niedogodności. System jest obecnie w trybie konserwacji.
                        Wracamy tak szybko, jak to możliwe. Dziękujemy za cierpliwość.
                    </p>
                    {systemSettings.maintenanceMessage && (
                        <p className="text-lg text-gray-400 mt-4">{systemSettings.maintenanceMessage}</p>
                    )}
                </div>
            )}

            {/* --- SIDEBAR --- */}
            <aside className="w-20 lg:w-64 bg-theme-sidebar border-r border-theme flex flex-col z-20 backdrop-blur-xl transition-all duration-300">
                <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-theme shrink-0 gap-3">
                    <div className="relative group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-cyan-400 animate-pulse-ring flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                            <Activity size={18} className="text-white relative z-10" />
                        </div>
                        <div className="absolute inset-0 bg-white/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <div className="hidden lg:block">
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">MediaFlow</h1>
                        <div className="text-[9px] font-mono text-theme-accent tracking-[0.2em] font-bold">V7.5 ENTERPRISE</div>
                    </div>
                </div>

                <nav className="p-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="hidden lg:block px-4 py-2 text-[10px] font-bold text-theme-secondary uppercase tracking-widest mt-2">{t('nav.workspace')}</div>
                    <NavItem active={activeTab === 'upload'} onClick={() => navigateTo('upload')} icon={<Upload size={20} />} label={t('nav.upload')} />
                    <NavItem active={activeTab === 'library'} onClick={() => navigateTo('library')} icon={<Database size={20} />} label={t('nav.library')} badge={library?.filter(x => !x.archived).length} />
                    <NavItem active={activeTab === 'archive'} onClick={() => navigateTo('archive')} icon={<Archive size={20} />} label={t('nav.archive')} badge={library?.filter(x => x.archived).length} />

                    <div className="hidden lg:block px-4 py-2 text-[10px] font-bold text-theme-secondary uppercase tracking-widest mt-6">{t('nav.administration')}</div>
                    <NavItem active={activeTab === 'admin'} onClick={() => navigateTo('admin')} icon={<ShieldCheck size={20} />} label={t('nav.admin')} />
                    <NavItem active={activeTab === 'settings'} onClick={() => navigateTo('settings')} icon={<Settings size={20} />} label={t('nav.settings')} />


                </nav>

                <div className="p-4 border-t border-theme bg-theme-panel space-y-3">
                    {deferredPrompt && (
                        <button
                            onClick={promptInstall}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold py-2 rounded-lg hover:shadow-lg hover:shadow-violet-500/20 transition-all active:scale-95"
                        >
                            <MonitorDown size={16} />
                            <span className="hidden lg:inline text-white">{userSettings?.language === 'pl' ? 'Zainstaluj Aplikację' : 'Install App'}</span>
                        </button>
                    )}
                    <div className="glass-panel p-3 rounded-xl flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer group">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-sm text-white shadow-inner ring-2 ring-black">SA</div>
                        <div className="hidden lg:block overflow-hidden">
                            <div className="text-xs font-bold text-theme-primary truncate group-hover:text-emerald-300 transition-colors">Super Admin</div>
                            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                                <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>
                                Sesja Aktywna
                            </div>
                        </div>
                        <div className="ml-auto text-theme-secondary hover:text-theme-primary transition-colors"><LogOut size={16} /></div>
                    </div>
                </div>
            </aside>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="flex-1 relative overflow-hidden flex flex-col bg-transparent">

                {/* Announcement Banner */}
                {systemSettings?.announcement && (
                    <div className="w-full bg-blue-600/20 text-blue-200 text-sm py-2 px-4 flex items-center justify-center gap-2 z-10">
                        <Info size={16} />
                        <span>{systemSettings.announcement}</span>
                    </div>
                )}

                {/* --- DYNAMIC VIEWS --- */}

                {/* LIBRARY & ARCHIVE & ASSET DETAIL */}
                {(activeTab === 'library' || activeTab === 'archive') && (
                    currentFolder ? (
                        <AssetDetailView
                            asset={library?.find(a => a._id === currentFolder)}
                            navigateTo={navigateTo}
                            setConvertModalTargets={setConvertModalTargets}
                            activeMetadataSource={activeMetadataSource}
                            setActiveMetadataSource={setActiveMetadataSource}
                            selectedVersions={selectedVersions}
                            setSelectedVersions={setSelectedVersions}
                            toggleVersionSelection={toggleVersionSelection}
                            handleVersionBulkAction={handleVersionBulkAction}
                            activeJobs={activeJobs}
                            setPlayerAsset={setPlayerAsset}
                            apiCall={apiCall}
                            mutate={mutate}
                            addToast={addToast}
                        />
                    ) : (
                        <LibraryView
                            activeTab={activeTab}
                            currentFolder={currentFolder}
                            t={t}
                            library={library}
                            processedLibrary={processedLibrary}
                            storageMetrics={storageMetrics}
                            selectedItems={selectedItems}
                            setSelectedItems={setSelectedItems}
                            toggleSelection={toggleSelection}
                            handleSelectAll={handleSelectAll}
                            handleRestoreAsset={handleRestoreAsset}
                            handleDeleteAsset={handleDeleteAsset}
                            openBatchWizard={openBatchWizard}
                            handleBulkDownload={handleBulkDownload}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            filterType={filterType}
                            setFilterType={setFilterType}
                            filterFormat={filterFormat}
                            setFilterFormat={setFilterFormat}
                            sortOrder={sortOrder}
                            setSortOrder={setSortOrder}
                            navigateTo={navigateTo}
                            activeJobs={activeJobs}
                            setContextMenu={setContextMenu}
                        />
                    )
                )}

                {/* UPLOAD VIEW */}
                {activeTab === 'upload' && (
                    <UploadView
                        pendingFiles={pendingFiles}
                        setPendingFiles={setPendingFiles}
                        uploading={uploading}
                        uploadFiles={uploadFiles}
                        storageMetrics={storageMetrics}
                    />
                )}

                {/* ADMIN PANEL */}
                {activeTab === 'admin' && <AdminPanel />}

                {/* SETTINGS VIEW */}
                {activeTab === 'settings' && (
                    <SettingsView
                        userSettings={userSettings}
                        updateUserSettings={updateUserSettings}
                        t={t}
                    />
                )}

                {/* --- OVERLAYS (Global) --- */}

                {dragActive && (
                    <div className="fixed inset-0 z-[200] bg-violet-900/90 backdrop-blur-xl flex items-center justify-center pointer-events-none animate-in fade-in duration-300">
                        <div className="text-center text-white transform scale-110">
                            <div className="w-32 h-32 rounded-full border-4 border-white/20 flex items-center justify-center mx-auto mb-8 animate-[pulse-ring_2s_infinite]">
                                <Upload size={64} className="text-white" />
                            </div>
                            <h2 className="text-5xl font-bold mb-4 tracking-tight">Upuść pliki</h2>
                            <p className="text-xl text-violet-200">Dodaj materiały do biblioteki MediaFlow</p>
                        </div>
                    </div>
                )}

                {/* Wizard Modal (Single or Bulk) */}
                <ConversionWizard
                    isOpen={convertModalTargets.length > 0}
                    onClose={() => setConvertModalTargets([])}
                    onConvert={handleBulkConversionRequest}
                    assets={convertModalTargets}
                />

                {/* Active Conversions Panel */}
                <ConversionStatusPanel activeJobs={activeJobs} library={library || []} />

                {/* Confirmation Modal */}
                <ConfirmationModal {...confirmationModal} onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))} />

                {/* CONTEXT MENU */}
                <AssetContextMenu
                    contextMenu={contextMenu}
                    setContextMenu={setContextMenu}
                    selectedItems={selectedItems}
                    library={library}
                    activeTab={activeTab}
                    setConvertModalTargets={setConvertModalTargets}
                    handleRestoreAsset={handleRestoreAsset}
                    handleDeleteAsset={handleDeleteAsset}
                    handleArchiveAsset={handleArchiveAsset}
                    addToast={addToast}
                    handleArchiveDeleteFlow={handleArchiveDeleteFlow}
                    apiCall={apiCall}
                />

                {/* Lightbox Player */}
                {
                    playerAsset && (
                        <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-300">
                            <div className="h-16 flex items-center justify-between px-6 bg-[#0a0a0f] border-b border-white/10 shrink-0">
                                <div className="flex items-center gap-4">
                                    <h3 className="font-bold text-white flex items-center gap-3">
                                        <span className="badge bg-violet-600 border-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]">PREVIEW</span>
                                        {playerAsset.profile}
                                    </h3>
                                    <span className="text-slate-500 text-xs font-mono hidden md:inline opacity-50">{playerAsset.path}</span>
                                </div>
                                <button onClick={() => setPlayerAsset(null)} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"><X /></button>
                            </div>
                            <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                                {(playerAsset.mimetype?.startsWith('image/') && !['mp4', 'webm', 'mkv', 'mov'].includes(playerAsset.container)) ? (
                                    <img src={`${API_URL}/stream/${playerAsset._id}`} className="max-w-full max-h-full rounded-lg outline-none border border-white/5 shadow-2xl" />
                                ) : (
                                    <video src={`${API_URL}/stream/${playerAsset._id}`} controls autoPlay className="max-w-full max-h-full rounded-lg outline-none border border-white/5 shadow-2xl" />
                                )}
                            </div>
                        </div>
                    )
                }
            </main >
        </div >
    );
}

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, description, variant = 'danger', confirmText }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="p-4 space-y-6">
                <div className={`p-4 rounded-lg border ${variant === 'danger' ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-800 border-white/10'}`}>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{description}</p>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white shadow-lg transition-all ${variant === 'danger'
                            ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20'
                            : 'bg-violet-600 hover:bg-violet-500 shadow-violet-900/20'
                            }`}
                    >
                        {confirmText || 'Potwierdź'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default function AppContent() {
    return (
        <SettingsProvider>
            <InnerAppContent />
        </SettingsProvider>
    );
}
