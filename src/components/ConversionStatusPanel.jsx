import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader, CheckCircle, XCircle, Activity, Clock } from 'lucide-react';

const ConversionStatusPanel = ({ activeJobs = {}, library = [] }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Map active jobs to rich data found in library
    const jobsList = Object.entries(activeJobs).map(([id, job]) => {
        // Find the version and its parent asset
        let foundVersion = null;
        let parentAsset = null;

        for (const asset of library) {
            if (asset.generatedVersions) {
                const ver = asset.generatedVersions.find(v => v._id === id);
                if (ver) {
                    foundVersion = ver;
                    parentAsset = asset;
                    break;
                }
            }
            // Also check if the ID matches the asset itself (e.g. for thumbnail gen or root tasks)
            if (asset._id === id) {
                parentAsset = asset;
                break;
            }
        }

        return {
            id,
            ...job,
            originalName: parentAsset ? parentAsset.originalName : 'Nieznany plik',
            profile: foundVersion ? foundVersion.profile : (job.config?.profile || 'Przetwarzanie'),
            version: foundVersion
        };
    });

    if (jobsList.length === 0) return null;

    const totalProgress = jobsList.reduce((acc, curr) => acc + (curr.percent || 0), 0) / jobsList.length;

    return (
        <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${isCollapsed ? 'w-auto' : 'w-80 md:w-96'}`}>
            <div className="bg-[#1a1a20] border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">

                {/* Header / Summary */}
                <div
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="flex items-center justify-between p-3 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors border-b border-white/5"
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Activity size={18} className="text-violet-400 animate-pulse" />
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                            </span>
                        </div>
                        <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                Przetwarzanie plików
                                <span className="text-xs bg-violet-500 text-white px-1.5 rounded-full font-mono">{jobsList.length}</span>
                            </div>
                            {isCollapsed && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    Średni postęp: {totalProgress.toFixed(0)}%
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        {isCollapsed ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                </div>

                {/* Expanded Content */}
                {!isCollapsed && (
                    <div className="max-h-80 overflow-y-auto custom-scrollbar p-1">
                        {jobsList.map(job => (
                            <div key={job.id} className="p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="truncate pr-4">
                                        <div className="text-xs font-medium text-white truncate w-56" title={job.originalName}>
                                            {job.originalName}
                                        </div>
                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-0.5">
                                            {job.profile}
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono font-bold text-violet-300">
                                        {(job.percent || 0).toFixed(1)}%
                                    </div>
                                </div>

                                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden mb-2">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-300 ease-out"
                                        style={{ width: `${job.percent || 0}%` }}
                                    />
                                </div>

                                <div className="flex justify-between items-center text-[10px] text-slate-500">
                                    <div className="flex items-center gap-1.5">
                                        <Loader size={10} className="animate-spin text-violet-500" />
                                        <span>Konwertowanie...</span>
                                    </div>
                                    {job.eta && (
                                        <div className="flex items-center gap-1 font-mono">
                                            <Clock size={10} /> {job.eta}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConversionStatusPanel;
