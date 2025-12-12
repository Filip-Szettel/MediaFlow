import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    RefreshCw, AlertTriangle, Play, HardDrive, Clock, Activity, ImageIcon,
    Film, Music, Square, CheckSquare, Filter, ArrowUpDown,
    ArrowLeft, ChevronDown, File, Zap, Layers, Download, Trash2, X, VolumeX,
    FileVideo, MoreHorizontal, MonitorPlay, Info, Check, Folder
} from 'lucide-react';
import { API_URL } from '../../constants';
import { formatBytes, formatDuration, calculateBitrate, getAssetSize } from '../../utils';
import Tooltip from '../ui/Tooltip';
import { t } from '../../utils/i18n';

import ConversionWizard from '../ConversionWizard';
import { useSettings } from '../../context/SettingsContext';
import GlassSelect from '../common/GlassSelect';

export default function AssetDetailView({
    asset,
    navigateTo,
    setConvertModalTargets,
    activeMetadataSource,
    setActiveMetadataSource,
    selectedVersions,
    setSelectedVersions,
    toggleVersionSelection,
    handleVersionBulkAction,
    activeJobs,
    setPlayerAsset,
    apiCall,
    mutate,
    addToast,
    library, onBack, onNavigate
}) {
    const { id } = useParams();
    const navigate = useNavigate();
    const { settings } = useSettings();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [showWizard, setShowWizard] = useState(false);
    const [activeTab, setActiveTab] = useState('preview');
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const [versionSort, setVersionSort] = useState('newest'); // 'newest', 'oldest', 'size'
    const [versionFilter, setVersionFilter] = useState('all'); // 'all', 'mp4', 'webm', etc.

    // Option Lists
    const filterOptions = [
        { value: 'all', label: 'Wszystkie' },
        { value: 'mp4', label: 'MP4' },
        { value: 'webm', label: 'WebM' },
        { value: 'mov', label: 'MOV' },
        { value: 'avi', label: 'AVI' },
        { value: 'mkv', label: 'MKV' },
        { value: 'mp3', label: 'MP3' },
    ];

    const sortOptions = [
        { value: 'newest', label: 'Najnowsze' },
        { value: 'oldest', label: 'Najstarsze' },
        { value: 'size', label: 'Rozmiar' },
    ];

    const processedVersions = useMemo(() => {
        if (!asset || !asset.generatedVersions) return [];
        let result = [...asset.generatedVersions];

        // Filter
        if (versionFilter !== 'all') {
            result = result.filter(v => (v.container || 'mp4') === versionFilter);
        }

        // Sort
        result.sort((a, b) => {
            if (versionSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (versionSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (versionSort === 'size') return getAssetSize(b) - getAssetSize(a);
            return 0;
        });

        return result;
    }, [asset?.generatedVersions, versionSort, versionFilter]);

    if (!asset) return null;

    return (
        <div className="h-full flex flex-col animate-slide-up bg-black/40">
            {/* Toolbar */}
            <div className="h-16 border-b border-white/5 bg-[#0a0a0f]/50 flex items-center px-6 gap-4 sticky top-0 backdrop-blur z-20">
                <button onClick={() => navigateTo('library')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="hidden md:inline cursor-pointer hover:text-white hover:underline decoration-white/20 underline-offset-4" onClick={() => navigateTo('library')}>Biblioteka</span>
                    <ChevronDown size={12} className="-rotate-90 hidden md:block" />
                    <div className="text-white font-bold truncate max-w-md flex items-center gap-2">
                        <File size={14} className="text-violet-400" /> {asset.originalName}
                    </div>
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => setConvertModalTargets([asset])}
                    className="glass-button px-4 py-2 rounded-lg text-sm font-bold text-white bg-violet-600/20 border-violet-500/30 flex items-center gap-2 hover:bg-violet-600/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                >
                    <Zap size={16} className="text-violet-300" /> Kreator Konwersji
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col xl:flex-row">
                {/* Main Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">

                    {/* Master Player */}
                    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative mb-8 group ring-1 ring-white/5 flex items-center justify-center">
                        {asset.mimetype.startsWith('image/') ? (
                            <img src={`${API_URL}/stream/${asset._id}`} className="max-w-full max-h-full object-contain" />
                        ) : (
                            <video src={`${API_URL}/stream/${asset._id}`} controls className="w-full h-full object-contain" />
                        )}
                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-white/10 px-3 py-1 rounded text-xs font-bold text-white shadow-lg pointer-events-none flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${activeMetadataSource ? 'bg-slate-500' : 'bg-violet-500 animate-pulse'}`} /> MASTER SOURCE
                        </div>
                        {/* Clickable area to select master metadata */}
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent cursor-pointer" onClick={() => setActiveMetadataSource(null)} title="Kliknij aby zobaczyć metadane oryginału"></div>
                    </div>

                    {/* Helper to reset focus to master */}
                    <div className="absolute top-4 left-4 z-10 cursor-pointer" onClick={() => setActiveMetadataSource(null)}>
                        {/* Invisible overlay on master player title area roughly */}
                    </div>

                    <div className="mb-6 flex items-end justify-between border-b border-white/5 pb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-1"><Layers size={20} className="text-cyan-400" /> Wersje i Formaty</h3>
                            <p className="text-slate-500 text-sm">Zarządzaj wygenerowanymi wariantami tego pliku.</p>
                        </div>

                        <div className="flex items-center gap-3">
                            {selectedVersions.size > 0 && (
                                <div className="flex items-center gap-2 animate-in slide-in-from-right fade-in bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-lg">
                                    <span className="text-xs font-bold text-violet-300 mr-2">{selectedVersions.size} Wybrano</span>
                                    <button onClick={() => handleVersionBulkAction('download')} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white"><Download size={16} /></button>
                                    <button onClick={() => handleVersionBulkAction('delete')} className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"><Trash2 size={16} /></button>
                                    <div className="w-px h-3 bg-white/10 mx-1"></div>
                                    <button onClick={() => setSelectedVersions(new Set())} className="p-1 hover:bg-white/10 rounded text-slate-400"><X size={14} /></button>
                                </div>
                            )}

                            {/* Select All Toggle */}
                            {asset.generatedVersions?.length > 0 && (() => {
                                const allIds = asset.generatedVersions.map(v => v._id);
                                const allSelected = allIds.every(id => selectedVersions.has(id));
                                return (
                                    <button
                                        onClick={() => {
                                            const newSet = new Set(selectedVersions);
                                            if (allSelected) {
                                                allIds.forEach(id => newSet.delete(id));
                                            } else {
                                                allIds.forEach(id => newSet.add(id));
                                            }
                                            setSelectedVersions(newSet);
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-colors border-white/10 text-slate-400 hover:text-white hover:bg-white/5 bg-white/5"
                                    >
                                        {allSelected ? 'Odznacz Wszystkie' : 'Zaznacz Wszystkie'}
                                    </button>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Filters & Sort Toolbar */}
                    <div className="flex items-center gap-2 md:gap-4 mb-6 text-xs sticky top-0 bg-[#0a0514]/90 backdrop-blur z-30 py-2 -mx-2 px-2 border-b border-white/5 overflow-x-auto md:overflow-visible no-scrollbar p-2">
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-lg border border-white/5 shrink-0">
                            <span className="px-2 text-slate-500 font-bold flex items-center gap-1"><Filter size={12} /> Format:</span>
                            <GlassSelect
                                value={versionFilter}
                                onChange={setVersionFilter}
                                options={filterOptions}
                                className="w-[120px] glass-select-toolbar"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-lg border border-white/5">
                            <span className="px-2 text-slate-500 font-bold flex items-center gap-1"><ArrowUpDown size={12} /> Sort:</span>
                            <GlassSelect
                                value={versionSort}
                                onChange={setVersionSort}
                                options={sortOptions}
                                className="w-[120px] glass-select-toolbar"
                            />
                        </div>
                    </div>

                    {/* Versions Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 pb-20">
                        {processedVersions.map(ver => {
                            const job = activeJobs[ver._id];
                            const isProcessing = ver.status === 'processing' || ver.status === 'queued' || job;
                            const isError = ver.status === 'error';

                            return (
                                <div key={ver._id} onClick={() => toggleVersionSelection(ver._id)} className={`glass-panel p-4 rounded-xl flex gap-4 relative overflow-hidden group transition-all border cursor-pointer ${isError ? 'border-red-500/20' : 'border-white/5 hover:border-white/20'}`}>

                                    {/* Thumbnail / Status Icon */}
                                    <div className="w-32 aspect-video bg-black/50 rounded-lg flex items-center justify-center relative overflow-hidden border border-white/5 shrink-0">
                                        {isProcessing ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <RefreshCw className="animate-spin text-violet-400" size={20} />
                                                <span className="text-[9px] font-mono text-violet-300">{job?.percent ? `${Math.round(job.percent)}%` : '0%'}</span>
                                            </div>
                                        ) : isError ? (
                                            <AlertTriangle className="text-red-500" size={24} />
                                        ) : (
                                            <div className={`relative w-full h-full group/thumb transition-all ${selectedVersions.has(ver._id) ? 'ring-2 ring-emerald-500' : ''}`}>
                                                {/* Jeśli miałby thumbnail wersji, tu by był. Fallback to ikona */}
                                                <div className="w-full h-full flex items-center justify-center bg-[#151520]">
                                                    <Play className="text-white opacity-50 group-hover/thumb:opacity-100 transition-all transform group-hover/thumb:scale-110" size={24} />
                                                </div>
                                                {/* Type Badge */}
                                                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-mono font-bold text-white uppercase tracking-wider border border-white/10">
                                                    {ver.container || 'mp4'}
                                                </div>

                                                {/* Overlay Play Button on Hover */}
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all bg-black/40 backdrop-blur-sm z-20">
                                                    <button onClick={(e) => { e.stopPropagation(); setPlayerAsset(ver); }} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur border border-white/20 shadow-xl transform scale-90 group-hover/thumb:scale-100 transition-all hover:text-cyan-300">
                                                        <Play size={24} fill="currentColor" className="ml-1" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Selection Checkbox */}
                                    <div className={`absolute top-2 left-2 z-10 ${selectedVersions.has(ver._id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                        <div onClick={(e) => { e.stopPropagation(); toggleVersionSelection(ver._id); }} className="cursor-pointer">
                                            {selectedVersions.has(ver._id) ? <CheckSquare className="text-emerald-500 bg-black/80 rounded" size={18} /> : <Square className="text-white/50 hover:text-white bg-black/50 rounded" size={18} />}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="font-bold text-white text-sm truncate" title={ver.profile}>{ver.profile}</div>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider ${ver.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                isProcessing ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                    'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>{ver.status}</span>
                                        </div>

                                        {isProcessing ? (
                                            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden mt-1">
                                                <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${job?.percent || 0}%` }} />
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                                                <div className="flex items-center gap-2"><HardDrive size={10} /> {formatBytes(getAssetSize(ver))}</div>
                                                <div className="flex items-center gap-2 opacity-70"><Clock size={10} /> {new Date(ver.createdAt).toLocaleTimeString()}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col justify-center gap-2 border-l border-white/5 pl-3">
                                        <Tooltip content="Metadane"><button disabled={isProcessing} onClick={(e) => { e.stopPropagation(); setActiveMetadataSource(ver); }} className={`p-1.5 rounded disabled:opacity-30 ${activeMetadataSource?._id === ver._id ? 'bg-violet-500 text-white' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}><Activity size={16} /></button></Tooltip>
                                        <Tooltip content="Pobierz"><button disabled={isProcessing} onClick={(e) => { e.stopPropagation(); handleVersionBulkAction('download', ver._id); }} className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white disabled:opacity-30"><Download size={16} /></button></Tooltip>
                                        <Tooltip content="Usuń"><button disabled={isProcessing} onClick={async (e) => { e.stopPropagation(); if (confirm('Usunąć tę wersję?')) { await apiCall(`/assets/${ver._id}`, 'DELETE'); mutate(); addToast('Wersja usunięta', 'info'); } }} className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 disabled:opacity-30"><Trash2 size={16} /></button></Tooltip>
                                    </div>
                                </div>
                            );
                        })}
                        {asset.generatedVersions?.length === 0 && (
                            <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-xl bg-white/5 flex flex-col items-center justify-center">
                                <Layers size={32} className="text-slate-600 mb-3" />
                                <p className="text-slate-500 text-sm font-bold">Brak wygenerowanych wersji</p>
                                <p className="text-slate-600 text-xs mt-1">Użyj Kreatora Konwersji aby stworzyć formaty pochodne.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar Info Panel */}
                <div className="w-full xl:w-96 border-l border-white/5 bg-[#05050a]/50 p-6 overflow-y-auto custom-scrollbar">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Activity size={14} /> Metadata Analysis
                    </h3>

                    <div className="space-y-8">

                        {/* --- MASTER SOURCE METADATA --- */}
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                                <span className="text-xs font-bold text-theme-primary uppercase tracking-wider">MASTER SOURCE</span>
                            </div>

                            <div className="bg-theme-panel/50 p-4 rounded-xl border border-theme space-y-4">
                                <div>
                                    <div className="text-theme-secondary text-[10px] uppercase font-bold mb-1">Filename</div>
                                    <div className="text-theme-primary text-sm break-all font-medium leading-tight">{asset.originalName}</div>
                                </div>

                                {/* Detailed Probe Grid */}
                                {(() => {
                                    const probe = asset.probe;
                                    const isImage = asset.mimetype?.startsWith('image/');
                                    const video = probe?.video || probe;
                                    const audio = probe?.audio;

                                    const hasAudio = audio && (audio.codec_name || audio.channels > 0);

                                    if (isImage) {
                                        return (
                                            <div className="space-y-4">
                                                {/* Image Info */}
                                                <div className="bg-theme-surface p-3 rounded-lg border border-theme">
                                                    <div className="flex items-center gap-2 text-[10px] text-theme-secondary font-bold uppercase mb-2">
                                                        <ImageIcon size={12} className="text-violet-400" /> Image Info
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div><span className="text-theme-secondary block text-[9px]">Format</span><span className="font-mono text-theme-primary">{asset.mimetype?.split('/')[1] || 'N/A'}</span></div>
                                                        <div><span className="text-theme-secondary block text-[9px]">Resolution</span><span className="font-mono text-theme-primary">{video?.width || probe?.width ? `${video?.width || probe?.width}x${video?.height || probe?.height}` : 'N/A'}</span></div>
                                                    </div>
                                                </div>

                                                {/* General */}
                                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-theme">
                                                    <div><span className="text-[10px] text-theme-secondary">File Size</span><div className="font-mono text-xs text-theme-primary">{formatBytes(asset.size || probe?.size || probe?.format?.size)}</div></div>
                                                    <div><span className="text-[10px] text-theme-secondary">Type</span><div className="font-mono text-xs text-theme-primary">Image Source</div></div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-4">

                                            {/* Video Stream */}
                                            <div className="bg-theme-surface p-3 rounded-lg border border-theme">
                                                <div className="flex items-center gap-2 text-[10px] text-theme-secondary font-bold uppercase mb-2">
                                                    <Film size={12} className="text-violet-400" /> Video Stream
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div><span className="text-slate-600 block text-[9px]">Codec</span><span className="font-mono text-slate-300">{video?.codec_long_name || video?.codec_name || 'N/A'}</span></div>
                                                    <div><span className="text-slate-600 block text-[9px]">Resolution</span><span className="font-mono text-slate-300">{video?.width ? `${video.width}x${video.height}` : 'N/A'}</span></div>
                                                    <div><span className="text-slate-600 block text-[9px]">Frame Rate</span><span className="font-mono text-slate-300">{video?.r_frame_rate || 'N/A'}</span></div>
                                                    <div className="col-span-2"><span className="text-slate-600 block text-[9px]">Bitrate</span><span className="font-mono text-slate-300">{video?.bit_rate ? `${(video.bit_rate / 1000).toFixed(0)} kbps` : calculateBitrate(asset.size, asset.probe?.duration)}</span></div>
                                                </div>
                                            </div>

                                            {/* Audio Stream */}
                                            {hasAudio ? (
                                                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase mb-2">
                                                        <Music size={12} className="text-violet-400" /> Audio Stream
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div><span className="text-slate-600 block text-[9px]">Codec</span><span className="font-mono text-slate-300">{audio.codec_long_name || audio.codec_name}</span></div>
                                                        <div><span className="text-slate-600 block text-[9px]">Channels</span><span className="font-mono text-slate-300">{audio.channels} ({audio.channel_layout || '?'})</span></div>
                                                        <div><span className="text-slate-600 block text-[9px]">Sample Rate</span><span className="font-mono text-slate-300">{audio.sample_rate} Hz</span></div>
                                                        <div><span className="text-slate-600 block text-[9px]">Bitrate</span><span className="font-mono text-slate-300">{audio.bit_rate ? `${(audio.bit_rate / 1000).toFixed(0)} kbps` : 'N/A'}</span></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-black/30 p-4 rounded-lg border border-white/5 flex flex-col items-center justify-center gap-2 text-slate-500 opacity-70">
                                                    <div className="relative">
                                                        <VolumeX size={24} className="text-slate-600" />
                                                    </div>
                                                    <div className="text-[10px] uppercase font-bold tracking-wider">No Audio Stream</div>
                                                </div>
                                            )}

                                            {/* General */}
                                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                                <div><span className="text-[10px] text-slate-500">File Size</span><div className="font-mono text-xs text-white">{formatBytes(asset.size || probe?.size || probe?.format?.size)}</div></div>
                                                <div><span className="text-[10px] text-slate-500">Duration</span><div className="font-mono text-xs text-white">{formatDuration(probe?.duration || probe?.format?.duration || probe?.video?.duration)}</div></div>
                                            </div>

                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* --- VERSION METADATA (Conditional) --- */}
                        {activeMetadataSource && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300 delay-100 border-t border-white/10 pt-8 relative">
                                {/* Connecting line visually */}
                                <div className="absolute left-4 -top-8 bottom-0 w-px bg-gradient-to-b from-transparent via-violet-500/20 to-transparent -z-10" />

                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">SELECTED VERSION: {activeMetadataSource.profile}</span>
                                </div>

                                <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4 relative overflow-hidden">
                                    {/* Background gloss */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />

                                    <div>
                                        <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">Container / Format</div>
                                        <div className="text-white text-sm break-all font-medium leading-tight font-mono text-emerald-300">{activeMetadataSource.container || 'MP4'}</div>
                                    </div>

                                    {/* Detailed Probe Grid for Version */}
                                    {(() => {
                                        // Legacy vs New handling
                                        const probe = activeMetadataSource.probe || {};
                                        const isImage = activeMetadataSource.mimetype?.startsWith('image/');

                                        // For images, we might have video stream info (as it's often parsed as video stream by ffprobe) 
                                        // or just width/height in format/probe root.
                                        const video = probe.video || probe;
                                        const audio = probe.audio;
                                        const hasProbe = !!activeMetadataSource.probe;
                                        const hasAudio = audio && (audio.codec_name || audio.codec_long_name || audio.channels > 0);

                                        if (isImage) {
                                            return (
                                                <div className="space-y-4">
                                                    {/* Image Info */}
                                                    <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase mb-2">
                                                            <ImageIcon size={12} className="text-emerald-400" /> Image Info
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div><span className="text-slate-600 block text-[9px]">Format</span><span className="font-mono text-slate-300">{activeMetadataSource.mimetype?.split('/')[1] || 'N/A'}</span></div>
                                                            <div><span className="text-slate-600 block text-[9px]">Resolution</span><span className="font-mono text-slate-300">{video.width || probe.width ? `${video.width || probe.width}x${video.height || probe.height}` : 'N/A'}</span></div>
                                                        </div>
                                                    </div>

                                                    {/* General */}
                                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                                        <div><span className="text-[10px] text-slate-500">File Size</span><div className="font-mono text-xs text-white">{formatBytes(activeMetadataSource.size || probe?.size || probe?.format?.size)}</div></div>
                                                        <div><span className="text-[10px] text-slate-500">Type</span><div className="font-mono text-xs text-white">Image</div></div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // ... VIDEO / AUDIO RENDER ...
                                        return (
                                            <div className="space-y-4">
                                                {/* Video Stream */}
                                                <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase mb-2">
                                                        <Film size={12} className="text-emerald-400" /> Video Stream
                                                    </div>
                                                    {hasProbe || video.width ? (
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div><span className="text-slate-600 block text-[9px]">Codec</span><span className="font-mono text-slate-300">{video.codec_long_name || video.codec_name || activeMetadataSource.metadata?.codec || 'N/A'}</span></div>
                                                            <div><span className="text-slate-600 block text-[9px]">Resolution</span><span className="font-mono text-slate-300">{video.width ? `${video.width}x${video.height}` : (activeMetadataSource.metadata?.resolution || 'N/A')}</span></div>
                                                            <div><span className="text-slate-600 block text-[9px]">Frame Rate</span><span className="font-mono text-slate-300">{video.r_frame_rate || 'N/A'}</span></div>
                                                            <div><span className="text-slate-600 block text-[9px]">Bitrate</span><span className="font-mono text-slate-300">{video.bit_rate ? `${(video.bit_rate / 1000).toFixed(0)} kbps` : 'N/A'}</span></div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-slate-500 italic py-2">Szczegółowe dane niedostępne dla tej wersji (Legacy)</div>
                                                    )}
                                                </div>

                                                {/* Audio Stream */}
                                                {/* Audio Stream */}
                                                {hasProbe && hasAudio ? (
                                                    <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase mb-2">
                                                            <Music size={12} className="text-emerald-400" /> Audio Stream
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div><span className="text-slate-600 block text-[9px]">Codec</span><span className="font-mono text-slate-300">{audio.codec_long_name || audio.codec_name}</span></div>
                                                            <div><span className="text-slate-600 block text-[9px]">Channels</span><span className="font-mono text-slate-300">{audio.channels}</span></div>
                                                            <div className="col-span-2"><span className="text-slate-600 block text-[9px]">Bitrate</span><span className="font-mono text-slate-300">{audio.bit_rate ? `${(audio.bit_rate / 1000).toFixed(0)} kbps` : 'N/A'}</span></div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Display simple "No Audio" block when audio is missing
                                                    <div className="bg-black/30 p-4 rounded-lg border border-white/5 flex flex-col items-center justify-center gap-2 text-slate-500 opacity-70">
                                                        <div className="relative">
                                                            <VolumeX size={24} className="text-slate-600" />
                                                        </div>
                                                        <div className="text-[10px] uppercase font-bold tracking-wider">No Audio Stream</div>
                                                    </div>
                                                )}

                                                {/* General */}
                                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                                                    <div><span className="text-[10px] text-slate-500">File Size</span><div className="font-mono text-xs text-white">{formatBytes(activeMetadataSource.size || probe?.size || probe?.format?.size)}</div></div>
                                                    <div><span className="text-[10px] text-slate-500">Duration</span><div className="font-mono text-xs text-white">{formatDuration(probe?.duration || probe?.format?.duration || activeMetadataSource.metadata?.duration)}</div></div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Hint when no version selected */}
                        {!activeMetadataSource && (
                            <div className="border-t border-white/10 pt-8 text-center opacity-30">
                                <Layers size={32} className="mx-auto mb-2" />
                                <p className="text-xs">Wybierz wersję z listy ("Metadane"), aby porównać szczegóły.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
