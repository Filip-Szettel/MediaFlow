import React, { useState, useEffect, useCallback } from 'react';
import {
    Grid, File, Maximize2, Volume2, Music, RefreshCw, AlertTriangle,
    Info, CheckCircle, Scissors, Settings, Sliders, Clock,
    Monitor, Layers, Cpu, Box, Activity, VolumeX, ArrowRight, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { PRESETS, STANDARD_RESOLUTIONS, API_URL } from '../constants';
import Modal from './ui/Modal';
import Tooltip from './ui/Tooltip';
import { ScaleStrategyIcon, PadStrategyIcon } from './ui/Icons';
import { formatBytes, formatDuration } from '../utils'; // Ensure utils is imported/available if needed, or implement locally
import { useSettings } from '../context/SettingsContext';
import GlassSelect from './common/GlassSelect';

export default function ConversionWizard({ isOpen, onClose, file, onConvert, assets = [] }) {
    // 1. Definicja Hooków
    const [mode, setMode] = useState('simple'); // 'simple' | 'advanced'

    // Initial Config State
    const [config, setConfig] = useState({
        profile: '1080p',
        container: 'mp4',
        strategy: 'scale',

        // Audio Settings
        audio: 'copy', // 'copy' | 'none'
        audioChannels: '2', // '1', '2', '6'
        audioBitrate: '192k', // '96k', '128k', '192k', '320k'
        audioCodec: 'aac', // Moved from Video Settings

        // Advanced Video Settings
        videoCodec: 'libx264', // 'libx264', 'libx265', 'libvpx-vp9'
        pixFmt: 'yuv420p', // 'yuv420p', 'yuv420p10le', 'yuv444p'

        // Dimensions
        width: 1920,
        height: 1080,

        // Image to Video Config
        duration: 5, // Seconds
    });

    const [activeTab, setActiveTab] = useState('profile');
    const [warnings, setWarnings] = useState([]);

    // Advanced Mode State
    const [selectedAspectRatio, setSelectedAspectRatio] = useState('16:9');
    const [thumbnailUrl, setThumbnailUrl] = useState(null);

    // Comparison Navigation State
    const [comparisonIndex, setComparisonIndex] = useState(0);

    // Derived State for Proactive Blocking & Comparison
    const [sourceStats, setSourceStats] = useState({ maxHeight: Infinity, minBitrate: 0, refAsset: null, isSilent: false, isImage: false });

    // Bezpieczne sprawdzanie czy to batch
    const isBatch = assets && assets.length > 1;

    // Load Thumbnail & Calculate Stats for Blocking AND Silent Detection
    useEffect(() => {
        if (assets && assets.length > 0) {
            const first = assets[0];
            const id = first._id;
            setThumbnailUrl(`${API_URL}/stream/${id}?thumb=true`);

            let minH = Infinity;
            // Optimistic silent check - assume silent until proven otherwise?
            // Better: Check if ALL selected assets are silent (safe approach) or ANY (mixed approach).
            // UX Decision: If ANY selected file has audio, we enable the tab, but warn?
            // Safer UX: If the Reference File (First) is silent, we treat the batch context as potentially silent mixed.
            // But let's check the first one for the Wizard state primarily.

            const firstFileSilent = !first.probe?.audio || !first.probe?.audio?.codec_name;

            assets.forEach(a => {
                if (a.probe && a.probe.video && a.probe.video.height) {
                    if (a.probe.video.height < minH) minH = a.probe.video.height;
                }
            });

            const isImage = first.mimetype?.startsWith('image/');

            setSourceStats({
                maxHeight: minH === Infinity ? 1080 : minH,
                refAsset: first,
                isSilent: firstFileSilent,
                isImage: isImage
            });

            // Auto-Switch to 'none' audio if silent or image
            if (firstFileSilent || isImage) {
                setConfig(prev => ({ ...prev, audio: 'none' }));
            }
        }
    }, [assets]);

    // Auto-Correct Codecs based on Container
    useEffect(() => {
        if (config.container === 'webm') {
            // WebM supports VP8/VP9/AV1. We default to VP9.
            // If current is NOT VP9, switch it.
            if (config.videoCodec !== 'libvpx-vp9') {
                setConfig(prev => ({ ...prev, videoCodec: 'libvpx-vp9' }));
            }
            // Audio: WebM prefers Vorbis/Opus. MP3/AAC are technically doable but weird.
            // If AAC is selected, maybe nudge to Vorbis? For now, we leave audio unless it's strictly invalid.
        } else if (config.container === 'mp4') {
            // MP4 supports H.264, H.265. VP9 is technically possible in newer MP4 but rare.
            // If VP9 is selected, switch to H.264 safely.
            if (config.videoCodec === 'libvpx-vp9') {
                setConfig(prev => ({ ...prev, videoCodec: 'libx264' }));
            }
        } else if (config.container === 'avi') {
            // AVI doesn't like HEVC usually.
            if (config.videoCodec === 'libx265') {
                setConfig(prev => ({ ...prev, videoCodec: 'libx264' }));
            }
        }
    }, [config.container]);

    // Guardrails Logic for Batch
    const validateConfig = useCallback(() => {
        const newWarnings = [];
        if (!assets || assets.length === 0) return;

        const bitrateInflationFiles = [];
        const targetBitrateVal = parseInt(config.audioBitrate.replace('k', '')) * 1000;

        // Reset comparison index if out of bounds (safety)
        if (comparisonIndex >= assets.length) setComparisonIndex(0);

        assets.forEach((asset, idx) => {
            if (!asset.probe) return;

            // 1. Audio Bitrate Check
            if (config.audio !== 'none' && asset.probe.audio && config.audioBitrate !== 'original') {
                const sourceBitrate = asset.probe.audio.bit_rate;
                if (sourceBitrate && targetBitrateVal > sourceBitrate) {
                    bitrateInflationFiles.push(asset.originalName || asset.name);
                }
            }

            // 2. Audio Copy Conflict (Silent Source)
            if (config.audio === 'copy' && (!asset.probe.audio || !asset.probe.audio.codec_name)) {
                newWarnings.push({
                    type: 'error',
                    text: `Błąd audio w pliku "${asset.originalName}": Wybrano 'Zachowaj Audio', ale plik jest niemy.`
                });
            }

            // 3. Upscaling Check (Significant)
            // If custom or preset defines height, check against source
            if (config.height) {
                const sourceH = asset.probe.video?.height;
                if (sourceH && config.height > sourceH * 1.5) {
                    newWarnings.push({
                        type: 'warn',
                        text: `Upscaling ryzyko: "${asset.originalName}" (${sourceH}p -> ${config.height}p). Jakość może być słaba.`
                    });
                }
            }
        });

        if (bitrateInflationFiles.length > 0) {
            const fileList = bitrateInflationFiles.length > 3
                ? bitrateInflationFiles.slice(0, 3).join(', ') + ` i ${bitrateInflationFiles.length - 3} innych`
                : bitrateInflationFiles.join(', ');

            newWarnings.push({
                type: 'warn',
                text: `Bitrate Inflation (${config.audioBitrate}) dla: ${fileList}`
            });
        }

        // Auto-correction handles most incompatibility now.
        // We only warn about "Soft" rules.
        if (config.container === 'avi' && config.audioCodec === 'aac') {
            newWarnings.push({ type: 'warn', text: 'AAC w AVI to rzadka kombinacja.' });
        }
        if (config.container === 'webm' && config.audioCodec === 'libmp3lame') {
            newWarnings.push({ type: 'warn', text: 'MP3 w WebM? Użyj Opus.' });
        }

        setWarnings(newWarnings);
    }, [config, assets, comparisonIndex]);

    useEffect(() => { validateConfig(); }, [config, validateConfig]);

    useEffect(() => {
        if (mode === 'simple' && PRESETS[config.profile]) {
            const p = PRESETS[config.profile];
            setConfig(prev => ({ ...prev, width: p.width, height: p.height }));
        }
    }, [config.profile, mode]);

    if (!isOpen) return null;
    if (!assets || assets.length === 0) return null;

    const hasCriticalErrors = warnings.some(w => w.type === 'error');

    const handleStart = () => {
        if (hasCriticalErrors) return;

        const finalConfig = { ...config };
        if (finalConfig.profile === 'custom') {
            finalConfig.profile = `${finalConfig.width}x${finalConfig.height}`;
        }

        onConvert(finalConfig);
    };

    const handleResolutionForced = (res) => {
        setConfig({
            ...config,
            profile: 'custom',
            width: res.w,
            height: res.h
        });
    };

    const isResolutionTooHigh = (h) => h > sourceStats.maxHeight;

    // Helper to render comparator rows
    const renderDiffRow = (label, sourceVal, targetVal) => {
        let status = 'neutral';

        // Logic for arrow indicators
        if (label === 'Wymiary') {
            const [sW, sH] = String(sourceVal).split('x').map(Number);
            const [tW, tH] = String(targetVal).split('x').map(Number);
            if (sW && tW) { // Only compare if valid numbers
                if (tH > sH) status = 'up';
                else if (tH < sH) status = 'down';
            }
        } else if (label.includes('Bitrate') && sourceVal !== '-' && sourceVal !== 'Silent') {
            const sB = parseInt(sourceVal);
            const tB = parseInt(targetVal);
            if (!isNaN(sB) && !isNaN(tB)) {
                if (tB > sB) status = 'up';
                else if (tB < sB) status = 'down';
            }
        } else if (sourceVal !== targetVal && sourceVal !== '-' && targetVal !== '-') {
            status = 'changed';
        }

        return (
            <div className="grid grid-cols-[80px_1fr_20px_1fr] items-center text-[10px] py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-2">
                <div className="text-slate-500 font-medium truncate pr-2">{label}</div>

                {/* Source Value */}
                <div className="text-slate-400 font-mono truncate text-right" title={sourceVal}>
                    {sourceVal}
                </div>

                {/* Arrow Indicator */}
                <div className="flex justify-center text-slate-600">
                    {status === 'neutral' && <Minus size={10} />}
                    {status === 'up' && <ArrowUpRight size={10} className="text-red-400" />}
                    {status === 'down' && <ArrowDownRight size={10} className="text-emerald-400" />}
                    {status === 'changed' && <ArrowRight size={10} className="text-violet-400" />}
                </div>

                {/* Target Value */}
                <div className={`font-mono truncate text-right font-bold ${status === 'up' ? 'text-red-300' :
                    status === 'down' ? 'text-emerald-300' :
                        status === 'changed' ? 'text-violet-300' : 'text-slate-300'
                    }`} title={targetVal}>
                    {targetVal}
                </div>
            </div>
        );
    };

    // Prepare Comparator Data
    // Use comparisonIndex to select the asset for comparison
    const ref = assets[comparisonIndex] || sourceStats.refAsset;

    // Robust Extraction Logic for Comparator
    let refVideo = {};
    let refAudio = {};

    if (ref && ref.probe) {
        if (ref.probe.video) {
            refVideo = ref.probe.video;
            refAudio = ref.probe.audio || {};
        } else {
            refVideo = ref.probe;
            refAudio = {};
        }
    }

    // Fallback for missing data
    const srcRes = (refVideo.width && refVideo.height) ? `${refVideo.width}x${refVideo.height}` : '-';
    const srcCodec = refVideo.codec_name || '-';
    // Logic: if video exists but audio doesn't, it's likely Silent, not "N/A"
    const isSilentFile = (!refAudio.codec_name && refVideo.codec_name);
    const srcAudio = refAudio.codec_name || (isSilentFile ? 'Silent' : '-');
    const srcBitrate = refAudio.bit_rate ? Math.round(refAudio.bit_rate / 1000) + 'k' : (isSilentFile ? '-' : '-');

    // Target data
    const tgtRes = `${config.width}x${config.height}`;
    const tgtCodec = config.videoCodec.replace('lib', '').replace('x264', 'h264').replace('x265', 'h265');
    const tgtAudio = config.audio === 'none' ? 'Mute' : config.audioCodec.replace('lib', '');
    const tgtBitrate = config.audio === 'none' ? '-' : (config.audioBitrate === 'original' ? 'Oryginał' : config.audioBitrate);
    const tgtDuration = sourceStats.isImage ? `${config.duration}s` : (ref?.probe?.duration ? formatDuration(ref.probe.duration) : '-');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isBatch ? `Wsadowa Konwersja (${assets.length} plików)` : "Kreator Konwersji (Engine v3)"} size="2xl">
            {/* Main Layout - Deep Violet Theme */}
            <div className="flex flex-col h-[700px] bg-[#130b24] text-slate-300">
                {/* Header Toolbar */}
                <div className="bg-black/20 border-b border-white/5 px-4 py-2 flex justify-between items-center bg-gradient-to-r from-violet-900/20 to-transparent">
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className={mode === 'simple' ? 'text-white font-bold' : 'text-slate-500'}>Prosty</span>
                        <button
                            onClick={() => setMode(mode === 'simple' ? 'advanced' : 'simple')}
                            className={`w-10 h-5 rounded-full relative transition-colors duration-300 shadow-inner ${mode === 'advanced' ? 'bg-violet-600' : 'bg-slate-800'}`}
                        >
                            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm ${mode === 'advanced' ? 'translate-x-5' : ''}`} />
                        </button>
                        <span className={mode === 'advanced' ? 'text-violet-300 font-bold' : 'text-slate-500'}>Zaawansowany</span>
                    </div>
                    {mode === 'advanced' && <div className="text-[10px] bg-violet-600/20 text-violet-300 px-2 py-0.5 rounded border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.2)]">Tryb Eksperta</div>}
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar - Widened for Comparator */}
                    <div className="w-80 border-r border-white/5 bg-black/10 p-4 space-y-2 flex flex-col z-10 shrink-0">
                        {[
                            { id: 'profile', label: mode === 'advanced' ? 'Rozdzielczość' : 'Jakość', icon: <Monitor size={18} /> },
                            { id: 'format', label: 'Format & Kodeki', icon: <File size={18} /> },
                            { id: 'geometry', label: 'Geometria', icon: <Maximize2 size={18} /> },
                            { id: 'audio', label: 'Audio & Mix', icon: <Music size={18} />, disabled: sourceStats.isSilent, disabledReason: 'Plik źródłowy nie posiada ścieżki audio.' }
                        ].map(tab => (
                            <Tooltip key={tab.id} content={tab.disabled ? tab.disabledReason : null}>
                                <button
                                    onClick={() => !tab.disabled && setActiveTab(tab.id)}
                                    disabled={tab.disabled}
                                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${tab.disabled ? 'opacity-40 cursor-not-allowed text-slate-600' :
                                        activeTab === tab.id ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30 font-bold shadow-[0_0_15px_rgba(139,92,246,0.1)]' : 'text-slate-500 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            </Tooltip>
                        ))}

                        {/* COMPARATOR PANEL */}
                        <div className="mt-auto pt-4 border-t border-white/10">
                            <div className="bg-violet-950/30 rounded-xl border border-violet-500/30 backdrop-blur-sm overflow-hidden shadow-lg">
                                <div className="p-2.5 bg-black/40 flex justify-between items-center border-b border-white/5">
                                    <div className="text-[10px] uppercase font-bold text-violet-300 flex items-center gap-2">
                                        <Activity size={12} /> Porównanie
                                    </div>
                                    {isBatch ? (
                                        <div className="flex items-center gap-2 bg-black/40 rounded px-1">
                                            <button
                                                onClick={() => setComparisonIndex(i => (i - 1 + assets.length) % assets.length)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                            >
                                                &lt;
                                            </button>
                                            <div className="text-[9px] text-slate-300 font-mono w-12 text-center truncate">
                                                {comparisonIndex + 1} / {assets.length}
                                            </div>
                                            <button
                                                onClick={() => setComparisonIndex(i => (i + 1) % assets.length)}
                                                className="text-slate-400 hover:text-white transition-colors"
                                            >
                                                &gt;
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-[9px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">Ref: #1</div>
                                    )}
                                </div>
                                <div className="p-0">
                                    {/* Header Row */}
                                    <div className="grid grid-cols-[80px_1fr_20px_1fr] px-2 py-1.5 bg-white/5 text-[9px] text-slate-400 font-bold uppercase">
                                        <div>Parametr</div>
                                        <div className="text-right">Źródło</div>
                                        <div></div>
                                        <div className="text-right">Cel</div>
                                    </div>

                                    {renderDiffRow('Wymiary', srcRes, tgtRes)}
                                    {renderDiffRow('Codec (V)', srcCodec, tgtCodec)}
                                    {renderDiffRow('Codec (A)', srcAudio, tgtAudio)}
                                    {renderDiffRow('Bitrate', srcBitrate, tgtBitrate)}
                                    {sourceStats.isImage && renderDiffRow('Czas trwania', '-', tgtDuration)}
                                    {renderDiffRow('Kontener', ref?.originalName?.split('.').pop() || '?', config.container)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative bg-gradient-to-br from-[#1a1033] via-[#130b24] to-[#0a0514]">

                        {/* Warnings Banner */}
                        {warnings.length > 0 && (
                            <div className="mb-6 space-y-2 animate-in slide-in-from-top-2">
                                {warnings.map((w, i) => (
                                    <div key={i} className={`p-3 rounded-lg flex items-center gap-3 text-sm font-bold border shadow-lg ${w.type === 'error' ? 'bg-red-900/30 border-red-500/50 text-red-200' : 'bg-amber-900/30 border-amber-500/50 text-amber-200'}`}>
                                        <AlertTriangle size={18} /> {w.text}
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'profile' && (
                            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                                {mode === 'simple' ? (
                                    // SIMPLE MODE PRESETS
                                    <>
                                        <h3 className="text-lg font-bold text-white mb-4">Wybierz Preset Jakości</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.entries(PRESETS).map(([key, p]) => {
                                                const isDisabled = p.height && isResolutionTooHigh(p.height);
                                                return (
                                                    <Tooltip key={key} content={isDisabled ? `Źródło ma za małą rozdzielczość (${sourceStats.maxHeight}p)` : null}>
                                                        <button
                                                            onClick={() => !isDisabled && setConfig({ ...config, profile: key })}
                                                            disabled={isDisabled}
                                                            className={`w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden group 
                                                                ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed bg-black/20 border-white/5' :
                                                                    (config.profile === key ? 'bg-violet-600/30 border-violet-500 shadow-violet-500/20 shadow-lg ring-1 ring-violet-500/50' : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10')
                                                                }`}
                                                        >
                                                            <div className="font-bold text-white mb-1 group-hover:text-violet-200 transition-colors">{p.label}</div>
                                                            <div className="text-xs text-slate-400 font-mono">{p.width ? `${p.width}x${p.height}` : 'Audio Only'} • {p.bitrate}</div>
                                                            <div className="text-[10px] text-slate-500 mt-2">{p.desc}</div>
                                                            {config.profile === key && <div className="absolute top-0 right-0 p-2 text-violet-400"><CheckCircle size={20} /></div>}
                                                        </button>
                                                    </Tooltip>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    // ADVANCED MODE RESOLUTION SELECTOR
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-white">Zaawansowany Wybór Rozdzielczości</h3>
                                            <div className="flex gap-2 bg-black/30 p-1 rounded-lg">
                                                {Object.keys(STANDARD_RESOLUTIONS).map(ratio => (
                                                    <button
                                                        key={ratio}
                                                        onClick={() => setSelectedAspectRatio(ratio)}
                                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${selectedAspectRatio === ratio ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                                                    >
                                                        {ratio}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                                            {STANDARD_RESOLUTIONS[selectedAspectRatio]?.map((res, i) => {
                                                const isDisabled = isResolutionTooHigh(res.h);
                                                return (
                                                    <Tooltip key={i} content={isDisabled ? `Upscaling zablokowany (Max: ${sourceStats.maxHeight}p)` : null}>
                                                        <button
                                                            onClick={() => !isDisabled && handleResolutionForced(res)}
                                                            disabled={isDisabled}
                                                            className={`w-full p-3 rounded-lg border text-left transition-all flex items-center justify-between 
                                                                ${isDisabled ? 'opacity-30 cursor-not-allowed bg-black/20 border-white/5' :
                                                                    (config.width === res.w && config.height === res.h && config.profile === 'custom' ? 'bg-violet-600/20 border-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.15)]' : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10')
                                                                }`}
                                                        >
                                                            <div>
                                                                <div className="font-mono text-white text-sm">{res.w} x {res.h}</div>
                                                                <div className="text-[10px] text-slate-500">{res.label}</div>
                                                            </div>
                                                            {config.width === res.w && config.height === res.h && config.profile === 'custom' && <CheckCircle size={16} className="text-violet-500" />}
                                                        </button>
                                                    </Tooltip>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-6 p-4 rounded-xl bg-black/20 border border-white/5 flex items-center gap-6">
                                            <div className="text-xs text-slate-500 uppercase font-bold w-32">Niestandardowe</div>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="number"
                                                    value={config.width}
                                                    onChange={(e) => setConfig({ ...config, profile: 'custom', width: parseInt(e.target.value) || 0 })}
                                                    className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono w-28 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all placeholder-slate-600"
                                                    placeholder="Width"
                                                />
                                                <span className="text-slate-500 font-bold">×</span>
                                                <input
                                                    type="number"
                                                    value={config.height}
                                                    onChange={(e) => setConfig({ ...config, profile: 'custom', height: parseInt(e.target.value) || 0 })}
                                                    className="bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white font-mono w-28 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all placeholder-slate-600"
                                                    placeholder="Height"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'format' && (
                            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
                                {/* Image Duration Setting */}
                                {sourceStats.isImage && (
                                    <div className="mb-8 pb-8 border-b border-white/5">
                                        <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2">
                                            <Clock size={14} /> Czas Trwania Wideo
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="300"
                                                    value={config.duration}
                                                    onChange={(e) => setConfig({ ...config, duration: Math.max(1, parseInt(e.target.value) || 5) })}
                                                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono font-bold text-lg w-32 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all shadow-inner"
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">sek</div>
                                            </div>
                                            <div className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
                                                Określ jak długi ma być wygenerowany materiał wideo z tego zdjęcia.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Container Selection */}
                                <div>
                                    <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Box size={14} /> Kontener Wyjściowy</label>
                                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                                        {[
                                            'mp4', 'webm', 'mov', 'mkv',
                                            ...(mode === 'advanced' ? ['avi', 'flv', 'wmv'] : [])
                                        ].map(fmt => (
                                            <button key={fmt} onClick={() => setConfig({ ...config, container: fmt })} className={`px-4 py-3 rounded-xl border font-mono font-bold uppercase transition-all ${config.container === fmt ? 'bg-cyan-900/40 border-cyan-500 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'bg-black/20 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}>
                                                {fmt}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Advanced Codec Selection */}
                                {mode === 'advanced' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-white/5">
                                        <div>
                                            <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Cpu size={14} /> Video Codec</label>
                                            <div className="space-y-2">
                                                {[
                                                    { id: 'libx264', label: 'H.264 (AVC)', desc: 'Standardowy, wysoka kompatybilność', invalidIn: ['webm'] },
                                                    { id: 'libx265', label: 'H.265 (HEVC)', desc: 'Wysoka kompresja, nowsze urządzenia', invalidIn: ['avi', 'webm'] },
                                                    { id: 'libvpx-vp9', label: 'VP9', desc: 'YouTube standard, WebM', invalidIn: ['mp4', 'avi', 'mov'] }
                                                ].map(c => {
                                                    const isInvalid = c.invalidIn && c.invalidIn.includes(config.container);
                                                    return (
                                                        <Tooltip key={c.id} content={isInvalid ? `Ten kodek nie jest zalecany dla kontenera .${config.container}` : null}>
                                                            <button
                                                                onClick={() => !isInvalid && setConfig({ ...config, videoCodec: c.id })}
                                                                disabled={isInvalid}
                                                                className={`w-full p-3 rounded-lg border text-left transition-all 
                                                                    ${isInvalid ? 'opacity-40 grayscale cursor-not-allowed bg-black/20 border-white/5' :
                                                                        (config.videoCodec === c.id ? 'bg-violet-600/30 border-violet-500 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10')
                                                                    }`}
                                                            >
                                                                <div className="text-white text-sm font-bold">{c.label}</div>
                                                                <div className="text-[10px] text-slate-400">{c.desc}</div>
                                                            </button>
                                                        </Tooltip>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Layers size={14} /> Pixel Format</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                {[
                                                    { id: 'yuv420p', label: 'Standard (4:2:0)', desc: 'Domyślny' },
                                                    { id: 'yuv420p10le', label: '10-bit Color', desc: 'HDR / High-Fidelity' },
                                                    { id: 'yuv444p', label: '4:4:4', desc: 'Bez subsamplingu' }
                                                ].map(pf => (
                                                    <button key={pf.id} onClick={() => setConfig({ ...config, pixFmt: pf.id })} className={`p-3 rounded-lg border text-left transition-all ${config.pixFmt === pf.id ? 'bg-pink-600/30 border-pink-500 shadow-lg' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                                        <div className="text-white text-sm font-bold font-mono">{pf.label}</div>
                                                        <div className="text-[10px] text-slate-400">{pf.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'geometry' && (
                            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-2">Strategia Dopasowania (Fit Strategy)</h3>
                                    <p className="text-slate-400 text-sm mb-6">Wybierz w jaki sposób materiał źródłowy ma zostać dopasowany do docelowej rozdzielczości ({config.width}x{config.height}).</p>

                                    <div className="grid grid-cols-3 gap-6">
                                        {[
                                            { id: 'scale', label: 'Fit (Standard)', icon: <ScaleStrategyIcon size={32} />, desc: 'Dopasuj do ramki (zachowaj proporcje).' },
                                            { id: 'crop', label: 'Crop (Przytnij)', icon: <Scissors size={32} />, desc: 'Wypełnij ramkę (utnij krawędzie).' },
                                            { id: 'pad', label: 'Letterbox', icon: <PadStrategyIcon size={32} />, desc: 'Dopasuj i wypełnij tło czernią.' }
                                        ].map(s => (
                                            <button key={s.id} onClick={() => setConfig({ ...config, strategy: s.id })} className={`p-6 rounded-2xl border text-center transition-all flex flex-col items-center gap-4 group ${config.strategy === s.id ? 'bg-emerald-900/30 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)] transform scale-[1.02]' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                                                <div className={`p-4 rounded-full transition-colors ${config.strategy === s.id ? 'bg-emerald-500 text-white' : 'bg-black/40 text-slate-500 group-hover:bg-black/60 group-hover:text-white'}`}>{s.icon}</div>
                                                <div>
                                                    <div className={`font-bold text-lg ${config.strategy === s.id ? 'text-white' : 'text-slate-300'}`}>{s.label}</div>
                                                    <div className="text-xs text-slate-500 mt-2 leading-relaxed">{s.desc}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* REAL GEO PREVIEW */}
                                <div className="p-8 bg-black/40 rounded-2xl border border-white/10 flex flex-col items-center gap-4 relative overflow-hidden group shadow-inner">
                                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />

                                    <div className="relative z-10 font-bold text-slate-400 text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Monitor size={12} /> Podgląd Rzeczywisty
                                    </div>

                                    {/* Duration Input for Images */}
                                    {sourceStats.isImage && (
                                        <div className="absolute top-4 right-4 z-20">
                                            <div className="bg-black/80 backdrop-blur rounded-lg border border-white/20 p-2 flex items-center gap-2 shadow-xl">
                                                <Clock size={14} className="text-violet-400" />
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="60"
                                                    value={config.duration}
                                                    onChange={(e) => setConfig({ ...config, duration: parseInt(e.target.value) || 5 })}
                                                    className="w-12 bg-transparent text-white font-bold text-center outline-none border-b border-white/20 focus:border-violet-500 text-sm"
                                                />
                                                <span className="text-xs text-slate-400 font-bold">sec</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* SIMULATION CONTAINER */}
                                    <div
                                        className="relative bg-[#050505] border-2 border-[#333] rounded-lg shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-300"
                                        style={{ width: '320px', height: '180px' }} // Fixed preview window, content adapted
                                    >
                                        {/* Reference Label */}
                                        <div className="absolute top-2 left-2 z-20 text-[9px] text-white/50 font-mono bg-black/50 px-1 rounded">
                                            OUT: {config.width}x{config.height}
                                        </div>

                                        {thumbnailUrl ? (
                                            <img
                                                src={thumbnailUrl}
                                                alt="Preview"
                                                className="transition-all duration-500 ease-in-out"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: config.strategy === 'crop' ? 'cover' : 'contain',
                                                }}
                                            />
                                        ) : (
                                            <div className="text-slate-600 text-xs">Brak podglądu</div>
                                        )}

                                        {/* Overlay Indicators for Clarity */}
                                        {config.strategy === 'pad' && (
                                            <div className="absolute inset-0 pointer-events-none border-[10px] border-black/0">
                                                {/* Visual hint that bars are being ADDED */}
                                                <div className="absolute right-2 bottom-2 text-[9px] text-slate-500">Letterbox Added</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'audio' && (
                            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
                                <div>
                                    <label className="block text-slate-400 text-xs uppercase font-bold mb-4">Główna Ścieżka</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={() => setConfig({ ...config, audio: 'copy' })} className={`p-6 rounded-xl border flex items-center gap-4 transition-all ${config.audio === 'copy' ? 'bg-violet-900/30 border-violet-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                            <div className={`p-3 rounded-full ${config.audio === 'copy' ? 'bg-violet-500 text-white' : 'bg-black/30 text-slate-500'}`}><Volume2 size={24} /></div>
                                            <div className="text-left">
                                                <div className="font-bold text-white text-lg">Zachowaj / Konwertuj</div>
                                                <div className="text-xs text-slate-400 mt-1">Przetwarza dźwięk zgodnie z ustawieniami.</div>
                                            </div>
                                        </button>
                                        <button onClick={() => setConfig({ ...config, audio: 'none' })} className={`p-6 rounded-xl border flex items-center gap-4 transition-all ${config.audio === 'none' ? 'bg-red-900/30 border-red-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                            <div className={`p-3 rounded-full ${config.audio === 'none' ? 'bg-red-500 text-white' : 'bg-black/30 text-slate-500'}`}><VolumeX size={24} /></div>
                                            <div className="text-left">
                                                <div className="font-bold text-white text-lg">Usuń Dźwięk</div>
                                                <div className="text-xs text-slate-400 mt-1">Plik wynikowy będzie całkowicie niemy (Mute).</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {config.audio === 'copy' && (
                                    <div className="space-y-6 pt-6 border-t border-white/5 animate-in slide-in-from-top-4">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Sliders size={14} /> Kanały Audio</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { id: '1', label: 'Mono', icon: '1.0' },
                                                        { id: '2', label: 'Stereo', icon: '2.0' },
                                                        { id: '6', label: '5.1', icon: 'Surround' }
                                                    ].map(ch => (
                                                        <button
                                                            key={ch.id}
                                                            onClick={() => setConfig({ ...config, audioChannels: ch.id })}
                                                            className={`p-3 rounded-lg border text-center transition-all ${config.audioChannels === ch.id ? 'bg-cyan-900/40 border-cyan-500 text-cyan-200 shadow-md' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                        >
                                                            <div className="font-bold text-sm">{ch.label}</div>
                                                            <div className="text-[10px] opacity-60">{ch.icon}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Activity size={14} /> Bitrate (Jakość)</label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {['original', '96k', '128k', '192k', '320k'].map(br => {
                                                        let label = br;
                                                        if (br === 'original') {
                                                            if (isBatch) label = 'Oryginał';
                                                            else {
                                                                // Extract simplistic bitrate from ref
                                                                const rate = refAudio?.bit_rate ? Math.round(refAudio.bit_rate / 1000) + 'k' : '???';
                                                                label = `Oryg. (~${rate})`;
                                                            }
                                                        }

                                                        return (
                                                            <button
                                                                key={br}
                                                                onClick={() => setConfig({ ...config, audioBitrate: br })}
                                                                className={`p-3 rounded-lg border text-center transition-all ${config.audioBitrate === br ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300 shadow-md' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                            >
                                                                <div className="font-bold text-sm">{label}</div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>


                                        <div className="mt-6">
                                            <label className="block text-slate-400 text-xs uppercase font-bold mb-3 flex items-center gap-2"><Music size={14} /> Audio Codec</label>
                                            <div className="grid grid-cols-2 gap-4">
                                                <GlassSelect
                                                    value={config.audioCodec}
                                                    onChange={(val) => setConfig({ ...config, audioCodec: val })}
                                                    options={[
                                                        { value: 'aac', label: 'AAC (Advanced Audio Coding)' },
                                                        { value: 'libmp3lame', label: 'MP3 (LAME)' },
                                                        { value: 'libopus', label: 'Opus (High Quality/Low Latency)' },
                                                        { value: 'flac', label: 'FLAC (Lossless)' }
                                                    ]}
                                                    className="w-full"
                                                />

                                                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex items-center gap-3 text-xs text-blue-200">
                                                    <Info size={14} />
                                                    <span>
                                                        Dla MP4 → AAC. <br />
                                                        Dla WebM → Opus.
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-white/5 bg-[#0a0514] flex justify-end gap-3 rounded-b-2xl">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:text-white transition-colors">Anuluj</button>
                    <button
                        onClick={handleStart}
                        disabled={hasCriticalErrors}
                        className={`px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold shadow-lg flex items-center gap-2 transition-all ${hasCriticalErrors ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:scale-105 hover:shadow-violet-600/40'}`}
                    >
                        <RefreshCw size={18} className={hasCriticalErrors ? '' : 'animate-spin-slow'} />
                        {isBatch ? `Przetwórz Wsadowo (${assets.length})` : 'Rozpocznij'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};


