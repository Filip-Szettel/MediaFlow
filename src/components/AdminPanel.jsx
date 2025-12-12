import React, { useState } from 'react';
import useSWR from 'swr';
import {
    ShieldCheck, Users, Activity, Cpu, HardDrive, Layers, Clock, Lock,
    Settings, Trash2, CheckCircle
} from 'lucide-react';
import { API_URL, USER_ROLES } from '../constants';
import { fetcher, apiCall } from '../api';
import { formatBytes } from '../utils';
import { useToast } from './ui/ToastProvider';
import Modal from './ui/Modal';
import { useSettings } from '../context/SettingsContext';
import GlassSelect from './common/GlassSelect';

const AdminPanel = () => {
    // Options for Selects
    const roleOptions = [
        { value: 'USER', label: 'Użytkownik' },
        { value: 'POWER_USER', label: 'Power User' },
        { value: 'ADMIN', label: 'Administrator' },
        { value: 'SUPER_ADMIN', label: 'Super Admin' }
    ];

    const statusOptions = [
        { value: 'active', label: 'Aktywne' },
        { value: 'blocked', label: 'Zablokowane' },
        { value: 'pending', label: 'Oczekujące' }
    ];

    const { systemSettings, updateSystemSettings, userSettings, updateUserSettings } = useSettings();
    const { data: users, mutate: mutateUsers } = useSWR(`${API_URL}/users`, fetcher);
    const { addToast } = useToast();
    const [activeTab, setActiveTab] = useState('users');
    const [editingUser, setEditingUser] = useState(null);
    const [isEditModalOpen, setEditModalOpen] = useState(false);

    // Mock logs for demonstration
    const [logs] = useState([
        { id: 1, type: 'info', msg: 'System startup sequence initiated', time: '10:00:01', module: 'KERNEL' },
        { id: 2, type: 'warn', msg: 'High memory usage detected on Worker #2', time: '10:05:23', module: 'WORKER_POOL' },
        { id: 3, type: 'error', msg: 'FFmpeg process terminated unexpectedly (Job #442)', time: '10:12:44', module: 'TRANSCODER' },
        { id: 4, type: 'info', msg: 'User jan@mediaflow.pl authenticated', time: '10:15:00', module: 'AUTH' },
        { id: 5, type: 'success', msg: 'Backup completed successfully (1.2GB)', time: '11:00:00', module: 'BACKUP' },
    ]);

    const handleDeleteUser = async (id) => {
        if (confirm('Czy na pewno chcesz usunąć tego użytkownika? Ta operacja usunie wszystkie jego pliki fizycznie.')) {
            try {
                await apiCall(`/users/${id}`, 'DELETE');
                mutateUsers();
                addToast('Użytkownik i jego dane zostały usunięte', 'success');
            } catch (e) { addToast(e.message, 'error'); }
        }
    };

    const handleSaveUser = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        // Konwersja typów (Input HTML zwraca stringi)
        data.quota = parseInt(data.quota) * 1024 * 1024 * 1024; // GB to Bytes
        data.maxThreads = parseInt(data.maxThreads);

        try {
            if (editingUser?._id) {
                // Mock update - w realnym backendzie PUT
                // await apiCall(`/users/${editingUser._id}`, 'PUT', data);

                // --- MOCK UPDATE CONTEXT ---
                // If we are editing the "current user" (simulated), update the context
                // In a real app check if editingUser._id === currentUser.id
                updateUserSettings({
                    quotaBytes: data.quota,
                    maxThreads: data.maxThreads,
                    role: data.role
                });

                addToast('Zaktualizowano ustawienia użytkownika (Symulacja)', 'success');
            } else {
                await apiCall('/users', 'POST', data);
                addToast('Nowy użytkownik został utworzony', 'success');
            }
            mutateUsers();
            setEditModalOpen(false);
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto custom-scrollbar animate-slide-up">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                        <ShieldCheck className="text-emerald-400" size={32} />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Panel Administratora</span>
                    </h2>
                    <p className="text-slate-500 text-sm mt-2 max-w-xl">
                        Pełna kontrola nad infrastrukturą MediaFlow. Zarządzaj kontami, przydzielaj zasoby obliczeniowe i monitoruj stan klastra.
                    </p>
                </div>
                <div className="flex bg-black/20 p-1 rounded-xl border border-white/10">
                    {[
                        { id: 'users', label: 'Użytkownicy', icon: <Users size={16} /> },
                        { id: 'settings', label: 'Ustawienia Systemu', icon: <Settings size={16} /> },
                        { id: 'logs', label: 'Logi Systemowe', icon: <Activity size={16} /> },
                        { id: 'nodes', label: 'Węzły Obliczeniowe', icon: <Cpu size={16} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {[
                    { label: 'Pamięć Masowa', val: '1.34 GB', sub: '/ 100 GB', icon: <HardDrive />, color: 'emerald', progress: 1.3 },
                    { label: 'Aktywne Wątki', val: '2', sub: '/ 8 Core', icon: <Cpu />, color: 'violet', progress: 25 },
                    { label: 'Kolejka Zadań', val: '0', sub: 'Oczekujące', icon: <Layers />, color: 'amber', progress: 0 },
                    { label: 'Uptime', val: '12d 4h', sub: 'Od restartu', icon: <Clock />, color: 'cyan', progress: 100 },
                ].map((stat, idx) => (
                    <div key={idx} className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                        <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-${stat.color}-400`}>
                            {React.cloneElement(stat.icon, { size: 64 })}
                        </div>
                        <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{stat.label}</div>
                        <div className="text-3xl font-bold text-white tracking-tight">{stat.val} <span className="text-sm font-normal text-slate-500">{stat.sub}</span></div>
                        <div className="mt-4 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full bg-${stat.color}-500 transition-all duration-1000`} style={{ width: `${stat.progress}%` }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="glass-panel rounded-2xl overflow-hidden animate-in fade-in">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                        <div>
                            <h3 className="font-bold text-white text-lg">Baza Użytkowników</h3>
                            <p className="text-xs text-slate-500">Zarządzaj dostępem i limitami (Quota Override)</p>
                        </div>
                        <button
                            onClick={() => { setEditingUser(null); setEditModalOpen(true); }}
                            className="glass-button px-4 py-2 rounded-xl text-emerald-400 font-bold flex items-center gap-2 hover:bg-emerald-500/10 border-emerald-500/20"
                        >
                            <Users size={16} /> Dodaj Użytkownika
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-black/20 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                                    <th className="p-4 pl-6">Tożsamość</th>
                                    <th className="p-4">Rola & Uprawnienia</th>
                                    <th className="p-4">Zasoby (Quota)</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right pr-6">Akcje</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-white/5">
                                {users?.map(user => (
                                    <tr key={user._id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="p-4 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-xs text-white border border-white/10">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-white">{user.name}</div>
                                                    <div className="text-slate-500 text-xs">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`badge ${user.role === 'SUPER_ADMIN' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                                    {user.role}
                                                </span>
                                                {user.role === 'POWER_USER' && <Cpu size={14} className="text-amber-400" title="High CPU Priority" />}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-mono text-slate-300 text-xs">Limit: {formatBytes(user.quota)}</span>
                                                <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                    {/* Tutaj można by wstawić realne zużycie jeśli API to zwraca */}
                                                    <div className="w-[10%] h-full bg-emerald-500" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {user.status === 'active' ? (
                                                <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/5 w-fit">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aktywny
                                                </span>
                                            ) : (
                                                <span className="text-red-400 text-xs font-bold flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/5 w-fit">
                                                    <Lock size={10} /> Zablokowany
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right pr-6">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingUser(user); setEditModalOpen(true); }} className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors" title="Edytuj"><Settings size={16} /></button>
                                                <button onClick={() => handleDeleteUser(user._id)} className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors" title="Usuń trwale"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
                <div className="glass-panel rounded-2xl overflow-hidden animate-in fade-in flex flex-col h-[600px]">
                    <div className="p-4 border-b border-white/5 bg-[#05050a] font-mono text-xs text-slate-400 flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2"><Activity size={14} className="text-violet-400" /> LIVE SYSTEM LOGS</div>
                        <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">FILTER: ALL</span>
                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 cursor-pointer hover:text-white">CLEAR</span>
                        </div>
                    </div>
                    <div className="flex-1 p-4 space-y-1 font-mono text-xs overflow-y-auto custom-scrollbar bg-[#020205]">
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-4 hover:bg-white/[0.03] p-1 rounded transition-colors group">
                                <span className="text-slate-600 min-w-[60px]">{log.time}</span>
                                <span className={`uppercase font-bold w-16 text-center rounded px-1 text-[10px] h-fit mt-0.5 ${log.type === 'error' ? 'bg-red-900/30 text-red-500' : log.type === 'warn' ? 'bg-amber-900/30 text-amber-500' : log.type === 'success' ? 'bg-emerald-900/30 text-emerald-500' : 'bg-blue-900/30 text-blue-500'}`}>{log.type}</span>
                                <span className="text-slate-500 w-24 hidden md:block">[{log.module}]</span>
                                <span className="text-slate-300 group-hover:text-white transition-colors">{log.msg}</span>
                            </div>
                        ))}
                        <div className="animate-pulse text-violet-500 mt-2 flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-violet-500 block" /> _ Awaiting signals...
                        </div>
                    </div>
                </div>
            )}

            {/* System Settings Tab */}
            {activeTab === 'settings' && (
                <div className="glass-panel rounded-2xl p-8 animate-in fade-in">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Settings className="text-violet-400" /> Konfiguracja Globalna
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Maintenance Mode */}
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="font-bold text-white">Tryb Konserwacji</h4>
                                    <p className="text-xs text-slate-400 mt-1">Blokuje dostęp dla wszystkich użytkowników (poza Adminem).</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={systemSettings.maintenanceMode}
                                        onChange={(e) => updateSystemSettings({ maintenanceMode: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                                </label>
                            </div>
                            {systemSettings.maintenanceMode && (
                                <div className="mt-4">
                                    <label className="text-xs text-slate-500 font-bold uppercase block mb-2">Wiadomość dla użytkowników</label>
                                    <input
                                        type="text"
                                        placeholder="Przepraszamy, trwa aktualizacja..."
                                        className="w-full glass-input"
                                        value={systemSettings.maintenanceMessage || ''}
                                        onChange={(e) => updateSystemSettings({ maintenanceMessage: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Global Announcement */}
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <h4 className="font-bold text-white mb-4">Ogłoszenie Systemowe</h4>
                            <p className="text-xs text-slate-400 mb-4">Wyświetla pasek z komunikatem na górze ekranu dla wszystkich.</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-slate-500 font-bold uppercase block mb-2">Treść Ogłoszenia</label>
                                    <input
                                        type="text"
                                        placeholder="Np. Planowana przerwa techniczna o 22:00"
                                        className="w-full glass-input"
                                        value={systemSettings.announcement}
                                        onChange={(e) => updateSystemSettings({ announcement: e.target.value })}
                                    />
                                </div>
                                {systemSettings.announcement && (
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => updateSystemSettings({ announcement: '' })}
                                            className="text-xs text-red-400 hover:text-red-300 font-bold"
                                        >
                                            <Trash2 size={12} className="inline mr-1" /> Usuń ogłoszenie
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* User Edit Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setEditModalOpen(false)}
                title={editingUser ? `Edycja: ${editingUser.name}` : "Nowy Użytkownik"}
            >
                <form onSubmit={handleSaveUser} className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2">
                            <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Nazwa Użytkownika</label>
                            <input name="name" required defaultValue={editingUser?.name} className="w-full glass-input" placeholder="Jan Kowalski" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Adres Email</label>
                            <input name="email" type="email" required defaultValue={editingUser?.email} className="w-full glass-input" placeholder="jan@example.com" />
                        </div>

                        <div>
                            <GlassSelect
                                label="Rola w Systemie"
                                value={editingUser?.role || 'USER'}
                                onChange={(val) => setEditingUser(prev => ({ ...prev, role: val }))}
                                options={roleOptions}
                                className="w-full"
                            />
                            <input type="hidden" name="role" value={editingUser?.role || 'USER'} />
                        </div>

                        <div>
                            <GlassSelect
                                label="Status Konta"
                                value={editingUser?.status || 'active'}
                                onChange={(val) => setEditingUser(prev => ({ ...prev, status: val }))}
                                options={statusOptions}
                                className="w-full"
                            />
                            <input type="hidden" name="status" value={editingUser?.status || 'active'} />
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-6">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2"><Cpu size={16} className="text-violet-400" /> Przydział Zasobów</h4>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Limit Przestrzeni (GB)</label>
                                <div className="flex items-center gap-4">
                                    <input name="quota" type="number" min="1" max="1000" defaultValue={editingUser ? editingUser.quota / (1024 * 1024 * 1024) : 1} className="w-full glass-input" />
                                    <span className="text-slate-500 font-bold">GB</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2">Domyślnie 1GB. Użyj "Override" dla Power Userów.</p>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Max Wątki CPU</label>
                                <input name="maxThreads" type="range" min="1" max="8" defaultValue={editingUser?.maxThreads || 1} className="w-full accent-violet-500 cursor-pointer" />
                                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                                    <span>1 Core</span>
                                    <span>8 Cores</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setEditModalOpen(false)} className="px-6 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Anuluj</button>
                        <button type="submit" className="px-8 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold shadow-lg shadow-violet-600/20 flex items-center gap-2">
                            <CheckCircle size={18} /> Zapisz Zmiany
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default AdminPanel;
