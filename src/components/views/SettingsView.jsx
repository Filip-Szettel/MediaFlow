import React from 'react';
import { Zap, Moon, Sun, Globe, CheckCircle } from 'lucide-react';

export default function SettingsView({
    userSettings,
    updateUserSettings,
    t
}) {
    return (
        <div className="p-8 h-full flex flex-col animate-slide-up">
            <header className="mb-8">
                <h2 className="text-3xl font-bold text-theme-primary mb-2">{t('settings.title')}</h2>
                <p className="text-theme-secondary">{t('settings.desc')}</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
                {/* Theme Selection */}
                <section className="space-y-4">
                    <h3 className="text-xl font-bold text-theme-primary flex items-center gap-2">
                        <Zap size={20} className="text-amber-400" /> {t('settings.theme')}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => updateUserSettings({ theme: 'dark' })}
                            className={`p-6 rounded-2xl border transition-all text-left group relative overflow-hidden ${userSettings.theme === 'dark' ? 'bg-violet-600/20 border-violet-500' : 'bg-theme-panel border-theme hover:border-theme-accent/30'}`}
                        >
                            <div className="mb-3 p-3 bg-black/50 rounded-lg w-fit">
                                <Moon size={24} className={userSettings.theme === 'dark' ? 'text-violet-400' : 'text-slate-500'} />
                            </div>
                            <div className="font-bold text-theme-primary mb-1">{t('settings.themeDark')}</div>
                            <div className="text-xs text-theme-secondary">Dark aesthetic, easy on eyes.</div>
                            {userSettings.theme === 'dark' && <div className="absolute top-2 right-2 text-violet-500"><CheckCircle size={16} /></div>}
                        </button>

                        <button
                            onClick={() => updateUserSettings({ theme: 'light' })}
                            className={`p-6 rounded-2xl border transition-all text-left group relative overflow-hidden ${userSettings.theme === 'light' ? 'bg-violet-600/20 border-violet-500' : 'bg-theme-panel border-theme hover:border-theme-accent/30'}`}
                        >
                            <div className="mb-3 p-3 bg-white/20 rounded-lg w-fit">
                                <Sun size={24} className={userSettings.theme === 'light' ? 'text-amber-400' : 'text-slate-500'} />
                            </div>
                            <div className="font-bold text-theme-primary mb-1">{t('settings.themeLight')}</div>
                            <div className="text-xs text-theme-secondary">Bright and clear.</div>
                            {userSettings.theme === 'light' && <div className="absolute top-2 right-2 text-violet-500"><CheckCircle size={16} /></div>}
                        </button>
                    </div>
                </section>

                {/* Language Selection */}
                <section className="space-y-4">
                    <h3 className="text-xl font-bold text-theme-primary flex items-center gap-2">
                        <Globe size={20} className="text-cyan-400" /> {t('settings.lang')}
                    </h3>
                    <div className="space-y-2">
                        <button
                            onClick={() => updateUserSettings({ language: 'pl' })}
                            className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${userSettings.language === 'pl' ? 'bg-violet-600/10 border-violet-500/50' : 'bg-theme-panel border-theme hover:bg-theme-header'}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🇵🇱</span>
                                <span className="font-bold text-theme-primary">{t('settings.langPL')}</span>
                            </div>
                            {userSettings.language === 'pl' && <CheckCircle size={16} className="text-violet-500" />}
                        </button>

                        <button
                            onClick={() => updateUserSettings({ language: 'en' })}
                            className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${userSettings.language === 'en' ? 'bg-violet-600/10 border-violet-500/50' : 'bg-theme-panel border-theme hover:bg-theme-header'}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🇬🇧</span>
                                <span className="font-bold text-theme-primary">{t('settings.langEN')}</span>
                            </div>
                            {userSettings.language === 'en' && <CheckCircle size={16} className="text-violet-500" />}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
