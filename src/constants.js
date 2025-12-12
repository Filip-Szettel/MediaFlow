export const API_URL = import.meta.env.VITE_API_URL || '/api';
// Symulacja tokena (w produkcji powinno to iść z kontekstu logowania/Auth0/NextAuth)
export const AUTH_TOKEN = "1234";

export const USER_ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    USER: 'USER',
    POWER_USER: 'POWER_USER'
};

export const PRESETS = {
    '1080p': {
        label: 'Full HD 1080p',
        width: 1920,
        height: 1080,
        bitrate: '5000k',
        desc: 'Standard kinowy / YouTube / Prezentacje',
        category: 'video'
    },
    '720p': {
        label: 'HD 720p',
        width: 1280,
        height: 720,
        bitrate: '2500k',
        desc: 'Szybki streaming / Web / Social Media',
        category: 'video'
    },
    '480p': {
        label: 'SD 480p',
        width: 854,
        height: 480,
        bitrate: '1000k',
        desc: 'Niska waga / Proxy / Archiwizacja masowa',
        category: 'video'
    },
    'mobile': {
        label: 'Mobile Portrait',
        width: 1080,
        height: 1920,
        bitrate: '3000k',
        desc: 'TikTok / Reels / Shorts (9:16)',
        category: 'video'
    },
    'audio': {
        label: 'Audio Extraction (MP3)',
        width: 0,
        height: 0,
        bitrate: '192k',
        desc: 'Ekstrakcja tylko ścieżki dźwiękowej',
        category: 'audio'
    }
};

export const STANDARD_RESOLUTIONS = {
    '4:3': [
        { w: 320, h: 240, label: 'QVGA 320x240' },
        { w: 640, h: 480, label: 'VGA 640x480' },
        { w: 800, h: 600, label: 'SVGA 800x600' },
        { w: 1024, h: 768, label: 'XGA 1024x768' },
        { w: 1280, h: 960, label: 'SVGA+ 1280x960' },
        { w: 1600, h: 1200, label: 'UXGA 1600x1200' },
        { w: 2048, h: 1536, label: 'QXGA 2048x1536' },
        { w: 2560, h: 1920, label: '2560x1920' }
    ],
    '5:4': [
        { w: 1280, h: 1024, label: 'SXGA+ 1280x1024' }
    ],
    '16:10': [
        { w: 1280, h: 800, label: 'WXGA 1280x800' },
        { w: 1440, h: 900, label: 'WXGA+ 1440x900' },
        { w: 1680, h: 1050, label: 'WSXGA+ 1680x1050' },
        { w: 1920, h: 1200, label: 'WUXGA 1920x1200' },
        { w: 2560, h: 1600, label: 'WQXGA 2560x1600' }
    ],
    '16:9': [
        { w: 640, h: 360, label: 'nHD 640x360' },
        { w: 854, h: 480, label: 'FWVGA 854x480' },
        { w: 1280, h: 720, label: 'HD 720p' },
        { w: 1366, h: 768, label: '1366x768' },
        { w: 1920, h: 1080, label: 'Full HD 1080p' },
        { w: 2560, h: 1440, label: 'QHD 1440p' },
        { w: 3840, h: 2160, label: '4K UHD' }
    ],
    '21:9': [
        { w: 2560, h: 1080, label: 'WFHD 2560x1080' },
        { w: 3440, h: 1440, label: 'WQHD+ 3440x1440' }
    ],
    '1:1': [
        { w: 1080, h: 1080, label: 'Square 1080x1080' }
    ]
};
