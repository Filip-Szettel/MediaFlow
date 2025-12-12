import { useState, useEffect, useCallback } from 'react';

export const useNavState = () => {
    const [activeTab, setActiveTabState] = useState('library');
    const [currentFolder, setCurrentFolderState] = useState(null);
    const [viewMode, setViewMode] = useState('grid');

    // We need to access standard window objects, so this runs only on client
    useEffect(() => {
        // Initial state from URL
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') || 'library';
        const folder = params.get('folder') || null;
        setActiveTabState(tab);
        setCurrentFolderState(folder);
    }, []);

    const navigateTo = useCallback((tab, folder = null) => {
        const params = new URLSearchParams();
        if (tab) params.set('tab', tab);
        if (folder) params.set('folder', folder);

        const newUrl = `${window.location.pathname}?${params.toString()} `;
        window.history.pushState({ tab, folder }, '', newUrl);

        setActiveTabState(tab);
        setCurrentFolderState(folder);
    }, []);

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get('tab') || 'library';
            const folder = params.get('folder') || null;
            setActiveTabState(tab);
            setCurrentFolderState(folder);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    return { activeTab, currentFolder, navigateTo, viewMode, setViewMode };
};
