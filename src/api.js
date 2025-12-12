import { API_URL, AUTH_TOKEN } from './constants';

export const fetcher = async (url) => {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } });
    if (!res.ok) throw new Error('API Error');
    return res.json();
};

export const apiCall = async (endpoint, method = 'GET', body = null) => {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            ...(body && { 'Content-Type': 'application/json' })
        }
    };
    if (body) options.body = JSON.stringify(body);

    // Specjalna obsługa pobierania (Blob)
    if (endpoint === '/download-zip') {
        const res = await fetch(`${API_URL}${endpoint}`, options);
        if (!res.ok) throw new Error('Download Error');
        return res.blob();
    }

    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (!res.ok) {
        const errorText = await res.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { }
        throw new Error(errorJson?.error || errorText || 'Unknown API Error');
    }
    return res.json();
};
