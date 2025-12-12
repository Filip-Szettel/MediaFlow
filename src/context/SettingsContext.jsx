import React, { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};

export const SettingsProvider = ({ children }) => {
    // System Settings
    const [systemSettings, setSystemSettings] = useState(() => {
        const saved = localStorage.getItem('mediaflow_system_settings');
        return saved ? JSON.parse(saved) : {
            maintenanceMode: false,
            announcement: '',
            debugMode: false,
            allowRegistration: true
        };
    });

    // Mock User Settings (simulating current user's limits)
    // In a real app, this would come from the user object in AuthContext or API
    const [userSettings, setUserSettings] = useState(() => {
        const saved = localStorage.getItem('mediaflow_user_settings');
        return saved ? JSON.parse(saved) : {
            quotaBytes: 1024 * 1024 * 1024, // 1 GB default
            maxThreads: 2,
            role: 'USER', // USER, POWER_USER, ADMIN
            theme: 'dark',
            language: 'pl'
        };
    });

    useEffect(() => {
        localStorage.setItem('mediaflow_system_settings', JSON.stringify(systemSettings));
    }, [systemSettings]);

    useEffect(() => {
        localStorage.setItem('mediaflow_user_settings', JSON.stringify(userSettings));
    }, [userSettings]);

    const updateSystemSettings = (updates) => {
        setSystemSettings(prev => ({ ...prev, ...updates }));
    };

    const updateUserSettings = (updates) => {
        setUserSettings(prev => ({ ...prev, ...updates }));
    };

    const value = {
        systemSettings,
        updateSystemSettings,
        userSettings,
        updateUserSettings
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
