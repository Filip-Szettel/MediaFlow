import React from 'react';
import {
    Database, Archive, Upload, Settings, ChevronDown, Folder, HardDrive, Layers,
    RefreshCw, Trash2, Download, X, Filter, LayoutGrid, List, Search,
    CheckSquare, Square, Film, File, Image as ImageIcon, Music, ArrowUpDown
} from 'lucide-react';
import { API_URL } from '../../constants';
import { formatBytes, formatDuration, getAssetSize } from '../../utils';
import GlassSelect from '../common/GlassSelect'; // Import GlassSelect

export default function LibraryView({
    activeTab,
    currentFolder,
    t,
    library, // full raw library for storage metrics or format list
    processedLibrary, // filtered/sorted assets to display
    storageMetrics,
    selectedItems,
    setSelectedItems,
    toggleSelection,
    handleSelectAll,
    handleRestoreAsset,
    handleDeleteAsset,
    openBatchWizard,
    handleBulkDownload,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    filterFormat,
    setFilterFormat,
    sortOrder,
    setSortOrder,
    navigateTo,
    activeJobs,
    setContextMenu
}) {
    const selectionMode = selectedItems.size > 0;
    const [showMobileFilters, setShowMobileFilters] = React.useState(false);

    // Option Lists for GlassSelect
    const typeOptions = [
        { value: 'all', label: t('filters.all') },
        { value: 'image', label: t('filters.image') },
        { value: 'video', label: t('filters.video') },
        { value: 'audio', label: t('filters.audio') },
    ];

    const formatOptions = [
        { value: 'all', label: t('filters.format') },
        ...['mp4', 'mov', 'webm', 'avi', 'mkv', 'mp3', 'png', 'jpg'].map(ext => ({ value: ext, label: ext.toUpperCase() }))
    ];

    const sortOptions = [
        { value: 'newest', label: 'Najnowsze' },
        { value: 'oldest', label: 'Najstarsze' },
        { value: 'name', label: 'Nazwa' },
        { value: 'size', label: 'Rozmiar' },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* --- HEADER --- */}
            <header className="flex flex-col gap-4 sticky top-0 bg-theme-base/95 backdrop-blur z-20 py-3 px-4 border-b border-theme/30 shrink-0 transition-all duration-300">

                {/* 1. Top Row: Title (Desktop) | Mobile: Search, Filter Toggle, View Mode */}
                <div className="flex items-center justify-between gap-3">

                    {/* Desktop Title & Storage */}
                    <div className="hidden md:flex items-center gap-4">
                        <h2 className="text-xl font-bold text-theme-primary capitalize tracking-tight flex items-center gap-2">
                            {activeTab === 'library' && <><Database size={20} className="text-theme-accent" /> {t('nav.library')}</>}
                            {activeTab === 'archive' && <><Archive size={20} className="text-amber-500" /> {t('nav.archive')}</>}
                        </h2>
                        {currentFolder && (
                            <div className="flex items-center gap-2 text-sm text-theme-secondary animate-in fade-in slide-in-from-left-4">
                                <ChevronDown className="-rotate-90" size={14} />
                                <Folder size={14} />
                                <span>{currentFolder}</span>
                            </div>
                        )}
                        <div className="hidden lg:flex items-center gap-6 h-8 px-4 bg-theme-panel rounded-full border border-theme ml-4">
                            <div className="flex items-center gap-2 text-[10px] font-medium text-theme-secondary">
                                <HardDrive size={12} className="text-theme-accent" />
                                <span className="text-theme-primary">{formatBytes(storageMetrics.source)}</span>
                            </div>
                            <div className="w-px h-3 bg-theme-border"></div>
                            <div className="flex items-center gap-2 text-[10px] font-medium text-theme-secondary">
                                <Layers size={12} className="text-cyan-400" />
                                <span className="text-theme-primary">{formatBytes(storageMetrics.versions)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Mobile: Search Bar + Toggles */}
                    <div className="md:hidden flex items-center gap-2 flex-1 w-full">
                        {/* Mobile Select All */}
                        <button
                            onClick={handleSelectAll}
                            className={`p-2 rounded-lg border transition-all shrink-0 ${selectedItems.size === processedLibrary.length && processedLibrary.length > 0
                                ? 'bg-violet-500/10 border-violet-500 text-violet-400'
                                : 'bg-theme-panel border-theme text-theme-secondary hover:text-theme-primary'
                                }`}
                            title={selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? "Odznacz wszystko" : "Zaznacz wszystko"}
                        >
                            {selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? (
                                <CheckSquare size={18} />
                            ) : (
                                <Square size={18} />
                            )}
                        </button>

                        <div className="relative group flex-1 min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-secondary group-focus-within:text-theme-accent transition-colors shrink-0" size={16} />
                            <input
                                type="text"
                                placeholder="Szukaj..."
                                className="glass-input pl-10 w-full h-[38px] text-sm min-w-0"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={() => setShowMobileFilters(!showMobileFilters)}
                            className={`p-2 rounded-lg border border-theme transition-all shrink-0 ${showMobileFilters ? 'bg-theme-accent text-white border-theme-accent' : 'bg-theme-panel text-theme-secondary hover:text-theme-primary'}`}
                        >
                            <Filter size={18} />
                        </button>

                        <div className="flex items-center gap-1 bg-theme-panel rounded-lg p-1 border border-theme shadow-sm shrink-0">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-theme-primary text-theme-main shadow-md' : 'text-theme-secondary'}`}><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-theme-primary text-theme-main shadow-md' : 'text-theme-secondary'}`}><List size={16} /></button>
                        </div>
                    </div>

                    {/* Desktop Controls (Right) */}
                    <div className="hidden md:flex items-center gap-2 ml-auto">
                        {/* Select All Button (Desktop) */}
                        <button
                            onClick={handleSelectAll}
                            className={`p-2 rounded-lg border transition-all shrink-0 ${selectedItems.size === processedLibrary.length && processedLibrary.length > 0
                                ? 'bg-violet-500/10 border-violet-500 text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                                : 'bg-theme-panel border-theme text-theme-secondary hover:text-theme-primary hover:bg-white/5'
                                }`}
                            title={selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? "Odznacz wszystko" : "Zaznacz wszystko"}
                        >
                            {selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? (
                                <CheckSquare size={18} />
                            ) : (
                                <Square size={18} />
                            )}
                        </button>

                        {/* Filters Group */}
                        <GlassSelect
                            value={filterType}
                            onChange={setFilterType}
                            options={typeOptions}
                            icon={Filter}
                            className="w-[140px]"
                        />
                        <GlassSelect
                            value={filterFormat}
                            onChange={setFilterFormat}
                            options={formatOptions}
                            className="w-[140px]"
                        />
                        <GlassSelect
                            value={sortOrder}
                            onChange={setSortOrder}
                            options={sortOptions}
                            icon={ArrowUpDown}
                            className="w-[160px]"
                        />
                        <div className="flex items-center gap-1 bg-theme-panel rounded-lg p-1 border border-theme shadow-sm">
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-theme-primary text-theme-main shadow' : 'text-theme-secondary hover:text-theme-primary'}`}><LayoutGrid size={16} /></button>
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-theme-primary text-theme-main shadow' : 'text-theme-secondary hover:text-theme-primary'}`}><List size={16} /></button>
                        </div>
                        <div className="relative group w-48 focus-within:w-64 transition-all duration-300">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-secondary" size={16} />
                            <input type="text" placeholder="Szukaj assetów..." className="glass-input pl-10 w-full h-[38px] text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* 2. Mobile Collapsible Filters Row */}
                {showMobileFilters && (
                    <div className="md:hidden flex flex-col gap-3 animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="grid grid-cols-2 gap-2">
                            <GlassSelect
                                value={filterType}
                                onChange={setFilterType}
                                options={typeOptions}
                                icon={Filter}
                            />
                            <GlassSelect
                                value={filterFormat}
                                onChange={setFilterFormat}
                                options={formatOptions}
                            />
                        </div>
                        <GlassSelect
                            value={sortOrder}
                            onChange={setSortOrder}
                            options={sortOptions}
                            icon={ArrowUpDown}
                        />
                    </div>
                )}

                {/* 3. Action Bar (Desktop: Hidden, Mobile: Visible if selection active) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:hidden">
                    {/* Left: Selection & Bulk Actions */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full pb-1 md:pb-0">
                        {/* Select All (Hidden on mobile as it is in top bar) */}
                        <button
                            onClick={handleSelectAll}
                            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-theme hover:bg-theme-panel transition-colors text-xs font-bold text-theme-secondary hover:text-theme-primary whitespace-nowrap"
                            title={selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? "Odznacz wszystko" : "Zaznacz wszystko"}
                        >
                            {selectedItems.size === processedLibrary.length && processedLibrary.length > 0 ? (
                                <><CheckSquare size={16} className="text-violet-500" /><span className="hidden xl:inline">Odznacz wszystko</span></>
                            ) : (
                                <><Square size={16} /><span className="hidden xl:inline">Zaznacz wszystko</span></>
                            )}
                        </button>

                        {/* Bulk Actions */}
                        {selectedItems.size > 0 && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-left fade-in bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                <span className="text-xs font-bold text-violet-300 mr-2">{selectedItems.size} <span className="hidden sm:inline">wybrano</span></span>
                                {activeTab === 'archive' ? (
                                    <>
                                        <button onClick={() => handleRestoreAsset(Array.from(selectedItems).map(id => library.find(a => a._id === id)))} className="text-theme-primary hover:text-emerald-300 px-1"><RefreshCw size={16} /></button>
                                        <div className="w-px h-3 bg-violet-500/30 mx-1"></div>
                                        <button onClick={() => { const items = Array.from(selectedItems).map(id => library.find(a => a._id === id)); handleDeleteAsset(items); }} className="text-theme-primary hover:text-red-300 px-1"><Trash2 size={16} /></button>
                                        <div className="w-px h-3 bg-violet-500/30 mx-1"></div>
                                        <button onClick={() => setSelectedItems(new Set())} className="text-violet-300 hover:text-white px-1"><X size={16} /></button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={openBatchWizard} className="text-theme-primary hover:text-violet-200 px-1"><RefreshCw size={16} /></button>
                                        <div className="w-px h-3 bg-violet-500/30 mx-1"></div>
                                        <button onClick={handleBulkDownload} className="text-theme-primary hover:text-violet-200 px-1"><Download size={16} /></button>
                                        <div className="w-px h-3 bg-violet-500/30 mx-1"></div>
                                        <button onClick={() => setSelectedItems(new Set())} className="text-violet-300 hover:text-white px-1"><X size={16} /></button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </header>

            {/* --- GRID / LIST CONTENT --- */}
            <div className="p-8 h-full overflow-y-auto custom-scrollbar animate-slide-up flex-1">
                {!processedLibrary || processedLibrary.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-theme-secondary opacity-50">
                        <Database size={64} strokeWidth={1} className="mb-4" />
                        <p className="text-lg">Biblioteka jest pusta. Prześlij pierwsze pliki.</p>
                    </div>
                ) : (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-20">
                                {processedLibrary.map(asset => {
                                    const isProcessing = Object.keys(activeJobs).some(jobId =>
                                        asset.generatedVersions?.some(v => v._id === jobId) || asset._id === jobId
                                    );
                                    const isSelected = selectedItems.has(asset._id);

                                    return (
                                        <div key={asset._id} className={`glass-panel rounded-xl overflow-hidden group relative aspect-[4/3] flex flex-col transition-all duration-300 ${isSelected ? 'ring-2 ring-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.2)] transform scale-[1.02]' : 'hover:border-white/20 hover:shadow-2xl'}`}>

                                            {/* Processing Indicator */}
                                            {isProcessing && (
                                                <div className="absolute top-3 right-3 z-30">
                                                    <div className="bg-violet-600/90 text-theme-primary text-[10px] uppercase font-bold px-2 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-md shadow-lg border border-violet-500/50 animate-pulse">
                                                        <RefreshCw size={10} className="animate-spin" />
                                                        <span>Przetwarzanie</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Selection Overlay */}
                                            <div className={`absolute top-0 left-0 w-full p-3 z-20 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 pointer-events-none ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <div className="pointer-events-auto" onClick={(e) => { e.stopPropagation(); toggleSelection(asset._id); }}>
                                                    {isSelected
                                                        ? <CheckSquare className="text-violet-500 bg-black/50 rounded shadow-lg cursor-pointer hover:scale-110 transition-transform" size={24} />
                                                        : <Square className="text-white/50 hover:text-white bg-black/30 rounded shadow-lg cursor-pointer hover:scale-110 transition-transform" size={24} />
                                                    }
                                                </div>
                                            </div>

                                            {/* Thumbnail / Content */}
                                            <div
                                                className="flex-1 bg-black relative flex items-center justify-center cursor-pointer overflow-hidden"
                                                onClick={() => toggleSelection(asset._id)}
                                                onDoubleClick={() => navigateTo('library', asset._id)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setContextMenu({ x: e.clientX, y: e.clientY, asset });
                                                }}
                                            >
                                                {asset.mimetype.includes('video') ? (
                                                    asset.thumbnail ? (
                                                        <img src={`${API_URL}/stream/${asset._id}?thumb=true`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" loading="lazy" />
                                                    ) : <video src={`${API_URL}/stream/${asset._id}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" muted onMouseOver={e => e.target.play().catch(() => { })} onMouseOut={e => { e.target.pause(); e.target.currentTime = 0; }} />
                                                ) : asset.mimetype.startsWith('image/') ? (
                                                    <img src={`${API_URL}/stream/${asset._id}`} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" loading="lazy" />
                                                ) : <ImageIcon size={48} className="text-slate-700" />}

                                                {/* Info Overlay - Milky Glass Effect */}
                                                <div className="absolute inset-x-0 bottom-0 bg-[var(--bg-overlay)] backdrop-blur-xl border-t border-theme p-3 flex items-center gap-3 z-10 transition-colors shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                                                    <div className="p-2 bg-theme-main/80 rounded-lg border border-theme shrink-0 shadow-sm">
                                                        {asset.mimetype.includes('video') ? <Film size={16} className="text-violet-500" /> : asset.mimetype.startsWith('image/') ? <ImageIcon size={16} className="text-emerald-500" /> : <File size={16} className="text-cyan-500" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-bold text-theme-primary text-sm truncate drop-shadow-sm">{asset.originalName}</h3>
                                                        <div className="text-[10px] text-theme-secondary font-mono flex gap-2 font-bold opacity-80">
                                                            <span>{formatBytes(getAssetSize(asset))}</span>
                                                            {asset.probe?.video && <span>• {asset.probe.video.height}p</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Version Badge */}
                                                {asset.generatedVersions?.length > 0 && (
                                                    <div className="absolute bottom-20 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded-md text-[9px] font-bold text-cyan-400 border border-cyan-500/30 shadow-lg z-10">
                                                        +{asset.generatedVersions.length} VERSIONS
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="pb-20">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/10 text-theme-secondary text-xs uppercase tracking-wider">
                                            <th className="p-4 w-12">
                                                <div onClick={handleSelectAll} className="cursor-pointer hover:text-theme-primary">
                                                    {(selectedItems.size === processedLibrary.length && processedLibrary.length > 0)
                                                        ? <CheckSquare size={16} className="text-violet-500" />
                                                        : <Square size={16} />
                                                    }
                                                </div>
                                            </th>
                                            <th className="p-4 w-12 text-center"><ImageIcon size={16} className="mx-auto" /></th>
                                            <th className="p-4 w-24 text-center">Format</th>
                                            <th className="p-4 w-24 text-center">Rodzaj</th>
                                            <th className="p-4 font-bold cursor-pointer hover:text-theme-primary transition-colors" onClick={() => setSortOrder('name')}>Name</th>
                                            <th className="p-4 cursor-pointer hover:text-theme-primary transition-colors" onClick={() => setSortOrder('size')}>Size</th>
                                            <th className="p-4">Resolution</th>
                                            <th className="p-4">Duration</th>
                                            <th className="p-4">Created</th>
                                            <th className="p-4 text-center">Versions</th>
                                            <th className="p-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {processedLibrary.map(asset => {
                                            const isSelected = selectedItems.has(asset._id);
                                            const ext = asset.path.split('.').pop().toUpperCase();
                                            let typeLabel = 'Inne';
                                            if (asset.mimetype.startsWith('video')) typeLabel = 'Wideo';
                                            if (asset.mimetype.startsWith('image')) typeLabel = 'Obraz';
                                            if (asset.mimetype.startsWith('audio')) typeLabel = 'Audio';

                                            return (
                                                <tr
                                                    key={asset._id}
                                                    onClick={() => toggleSelection(asset._id)}
                                                    onDoubleClick={() => navigateTo('library', asset._id)}
                                                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, asset }); }}
                                                    className={`group transition-colors cursor-pointer ${isSelected ? 'bg-violet-500/10' : 'hover:bg-white/5'}`}
                                                >
                                                    <td className="p-4" onClick={(e) => { e.stopPropagation(); toggleSelection(asset._id); }}>
                                                        {isSelected
                                                            ? <CheckSquare size={16} className="text-violet-500" />
                                                            : <Square size={16} className="text-slate-600 group-hover:text-slate-400" />
                                                        }
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center border border-white/5 overflow-hidden mx-auto">
                                                            {asset.thumbnail ? (
                                                                <img src={`${API_URL}/stream/${asset._id}?thumb=true`} className="w-full h-full object-cover" loading="lazy" />
                                                            ) : (
                                                                asset.mimetype.includes('video') ? <Film size={14} className="text-violet-400" /> : asset.mimetype.startsWith('image/') ? <ImageIcon size={14} className="text-emerald-400" /> : <File size={14} className="text-cyan-400" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-xs font-bold text-slate-500 text-center">{ext}</td>
                                                    <td className="p-4 text-xs text-slate-400 text-center">{typeLabel}</td>
                                                    <td className="p-4">
                                                        <div className="font-bold text-theme-primary text-sm">{asset.originalName}</div>
                                                        <div className="text-[10px] text-theme-secondary font-mono">{asset.path}</div>
                                                    </td>
                                                    <td className="p-4 text-sm text-theme-secondary font-mono">{formatBytes(getAssetSize(asset))}</td>
                                                    <td className="p-4 text-sm text-theme-secondary font-mono">{asset.probe?.video?.height ? `${asset.probe.video.height}p` : '-'}</td>
                                                    <td className="p-4 text-sm text-theme-secondary font-mono">{formatDuration(asset.probe?.duration || asset.probe?.format?.duration)}</td>
                                                    <td className="p-4 text-sm text-theme-secondary">{new Date(asset.createdAt).toLocaleDateString()}</td>
                                                    <td className="p-4 text-center">
                                                        {asset.generatedVersions?.length > 0 ? (
                                                            <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                                                                {asset.generatedVersions.length}
                                                            </span>
                                                        ) : <span className="text-slate-700">-</span>}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, asset }); }}
                                                            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                                                        >
                                                            <Settings size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )
                }
            </div >
        </div >
    );
}
