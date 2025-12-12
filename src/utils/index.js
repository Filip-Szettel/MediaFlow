/**
 * Formatuje liczbę bajtów do czytelnej postaci (KB, MB, GB).
 */
export const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Konwertuje sekundy na format MM:SS.
 */
export const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * Oblicza przybliżony bitrate na podstawie rozmiaru i czasu trwania.
 */
export const calculateBitrate = (size, duration) => {
    if (!size || !duration) return '0 kbps';
    const bps = (size * 8) / duration;
    return `${(bps / 1000).toFixed(0)} kbps`;
};

/**
 * Oblicza rozmiar pliku biorąc pod uwagę różne źródła (size, probe, bitrate*duration).
 */
export const getAssetSize = (asset) => {
    if (!asset) return 0;
    if (asset.size > 0) return asset.size;
    // Fallback: calculate from bitrate * duration
    const probe = asset.probe || {};
    const bitrate = probe.bit_rate || (probe.format && probe.format.bit_rate);
    const duration = probe.duration || (probe.format && probe.format.duration);

    if (bitrate && duration) {
        return Math.floor((bitrate * duration) / 8);
    }
    return 0;
};
