/**
 * ============================================================================
 * MEDIAFLOW APPLICATION ENGINE v5.1 - ENTERPRISE EDITION
 * ============================================================================
 * * The central nervous system of the MediaFlow Single Page Application.
 * * Orchestrates UI rendering, State Management, Real-time SSE communication,
 * * Client-side Media Processing, and complex business logic.
 * * * FEATURES INCLUDED IN v5.1:
 * - Client-Side Thumbnail Generation (Video & Image)
 * - Intelligent Thumbnail Caching (Fingerprinting)
 * - Reactive State Management with Proxy Pattern
 * - Global Header Toolbar Orchestration
 * - Advanced Batch Selection Logic (Context Aware)
 * - Persistent Settings & User Preferences
 * - Non-destructive Conversion Workflow
 * - Cinematic Media Player Implementation
 * - Drag & Drop Upload with Floating Action Bar
 * - Real-time FFmpeg Progress Tracking
 * @version 5.1.0
 * @license MIT
 * ============================================================================
 */

(() => {
    'use strict';

    // ==========================================================================
    // 1. SYSTEM CONFIGURATION & CONSTANTS
    // ==========================================================================
    
    const CONFIG = {
        /**
         * Key used for storing application state in localStorage.
         * Versioning ensures we don't load stale structures.
         */
        STORAGE_KEY: 'mediaFlow_v5_settings_store',
        CACHE_KEY_PREFIX: 'mf_thumb_',

        /**
         * Server-Sent Events endpoint for real-time hooks.
         */
        ENDPOINTS: {
            SSE: '/events',
            FILES: '/files',
            UPLOAD: '/upload',
            CONVERT: '/convert',
            DELETE: '/delete',
            DOWNLOAD: '/download',
            METADATA: '/metadata'
        },

        /**
         * Supported file extensions for client-side validation.
         * Grouped by media type for logical handling in the UI.
         */
        EXTENSIONS: {
            VIDEO: new Set(['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ogv', 'm4v', '3gp', 'ts']),
            AUDIO: new Set(['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma', 'opus', 'aiff']),
            IMAGE: new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg', 'ico'])
        },

        /**
         * Thumbnail Generation Configuration
         */
        THUMBNAILS: {
            WIDTH: 320, // px
            QUALITY: 0.7, // JPEG quality
            VIDEO_SEEK_TIME: 1.0, // Seconds to seek into video
            MAX_CACHE_SIZE_MB: 50 // Limit local storage usage
        },

        /**
         * UI Timing Constants (ms)
         */
        TIMING: {
            REFRESH_INTERVAL: 30000, // Background refresh
            TOAST_DURATION: 5000,    // Notification lifetime
            DEBOUNCE_DELAY: 300,     // Search input debounce
            ANIMATION_DURATION: 300  // CSS transition match
        },
        
        /**
         * DOM ID References.
         * Centralized mapping to prevent querySelector spaghetti.
         */
        DOM: {
            // Layout & Navigation
            APP_LAYOUT: 'appLayout',
            SIDEBAR: 'sidebar',
            SIDEBAR_TOGGLE: 'sidebarToggle',
            NAV_BADGES: {
                PENDING: 'navPendingCount'
            },
            
            // Header & Toolbar
            HEADER: {
                TITLE: 'currentTitle',
                ICON: 'headerIcon',
                SEARCH_CONTAINER: 'searchContainer',
                SEARCH_INPUT: 'globalSearch',
                SEARCH_CLEAR: 'searchClear',
                TOOLBAR: 'headerToolbar',
                BATCH_GROUP: 'batchActions',
                BTN_SELECT_ALL: 'btnSelectAll',
                BTN_CONVERT: 'btnBatchConvert',
                BTN_DOWNLOAD: 'btnBatchDownload',
                BTN_DELETE: 'btnBatchDelete'
            },

            // Containers
            TABS: {
                PENDING: 'pending',
                UPLOADS: 'uploads',
                CONVERTED: 'converted',
                SETTINGS: 'settings'
            },
            LISTS: {
                PENDING: 'pendingList',
                UPLOADS: 'uploadsList',
                CONVERTED: 'convertedList'
            },
            EMPTY_STATES: {
                PENDING: 'pendingEmpty',
                UPLOADS: 'uploadsEmpty',
                CONVERTED: 'convertedEmpty'
            },

            // Upload specific
            UPLOAD: {
                ZONE: 'uploadZone',
                INPUT: 'fileInput',
                SELECT_BTN: 'selectFilesBtn',
                DROP_OVERLAY: 'dropZone',
                ACTION_BAR: 'uploadActionBar',
                START_BTN: 'startUploadBtn',
                PROGRESS_FILL: 'uploadGlobalProgress',
                TOTAL_SIZE: 'uploadTotalSize',
                CLEAR_BTN: 'clearQueueBtn',
                COUNT_LABEL: 'pendingCountLabel'
            },

            // Modals
            MODALS: {
                CONVERT: 'convertModal',
                DETAILS: 'detailsModal',
                PLAYER: 'playerModal'
            },
            
            // Convert Form
            CONVERT_FORM: {
                FORM: 'convertForm',
                TARGETS: 'convertTargets',
                RESOLUTION: 'resolution',
                CRF: 'crf',
                BITRATE_V: 'bitrate',
                BITRATE_A: 'audioBitrate',
                ADVANCED: 'advanced',
                CLOSE_BTN: '.close-modal-btn'
            },

            // Player
            PLAYER: {
                CONTAINER: 'playerContainer',
                TITLE: 'playerFileName',
                DOWNLOAD_BTN: 'playerDownloadBtn'
            },

            // Settings
            SETTINGS: {
                FORMAT: 'settingDefaultFormat',
                CRF: 'settingDefaultCrf',
                SORT: 'settingSortBy',
                THEME: 'settingTheme'
            }
        }
    };

    // ==========================================================================
    // 2. ADVANCED STATE MANAGEMENT
    // ==========================================================================

    /**
     * Initial State Configuration.
     * Defines the source of truth for the entire application.
     */
    const defaultState = {
        // --- Data Collections ---
        // pendingFiles: Array of native File objects waiting for upload
        pendingFiles: [],       
        
        // uploads: Array of metadata objects from server (Source files)
        uploads: [],            
        
        // converted: Array of metadata objects from server (Output files)
        converted: [],          
        
        // --- Selections (Batch Operations) ---
        // Using Sets for O(1) lookups. Stores filenames.
        selection: {
            uploads: new Set(),
            converted: new Set()
        },
        
        // --- Active Processes ---
        // Maps filename -> { percent: number, status: string }
        activeConversions: {},
        isUploading: false,
        uploadProgress: 0,
        
        // --- UI State ---
        currentTab: 'pending', // 'pending' | 'uploads' | 'converted' | 'settings'
        searchQuery: '',
        sidebarCollapsed: false,
        
        // --- Preferences (Persisted) ---
        settings: {
            defaultFormat: 'mp4',
            defaultCrf: 23,
            sortBy: 'date', // 'date' | 'name' | 'size'
            theme: 'cyber'
        },

        // --- Caches ---
        // Map<string, object> - Cache for ffprobe metadata to avoid refetching
        metadataCache: new Map() 
    };

    /**
     * Reactive State Engine.
     * Uses JS Proxy to intercept state changes and trigger UI updates automatically.
     * This eliminates the need for manual render calls in business logic.
     */
    class StateManager {
        constructor(initialState) {
            this.state = this.createProxy(initialState);
            this.listeners = new Map(); // path -> Set<callback>
        }

        createProxy(obj, path = '') {
            return new Proxy(obj, {
                set: (target, key, value) => {
                    const fullPath = path ? `${path}.${key}` : key;
                    
                    // console.log(`[State] Mutation: ${fullPath}`, value); // Debugging
                    
                    target[key] = value;
                    
                    // Trigger specific listeners
                    this.notify(fullPath, value);
                    
                    // Trigger wildcard listeners for parent objects
                    // e.g., 'settings.defaultFormat' triggers 'settings'
                    if (path) this.notify(path, target);

                    // Special persistence triggers
                    if (fullPath.startsWith('settings') || fullPath === 'sidebarCollapsed') {
                        Persistence.save();
                    }

                    return true;
                }
            });
        }

        subscribe(path, callback) {
            if (!this.listeners.has(path)) {
                this.listeners.set(path, new Set());
            }
            this.listeners.get(path).add(callback);
        }

        notify(path, value) {
            if (this.listeners.has(path)) {
                this.listeners.get(path).forEach(cb => cb(value));
            }
        }
        
        // Helper to get raw state for non-proxy usage (e.g., JSON.stringify)
        getRaw() {
            return JSON.parse(JSON.stringify(this.state));
        }
    }

    // Initialize State
    const store = new StateManager({ ...defaultState });
    const state = store.state; // Direct access proxy

    // ==========================================================================
    // 3. CORE UTILITIES & HELPERS
    // ==========================================================================

    const Utils = {
        /**
         * Secure DOM Element Selector
         * @param {string} id - The ID of the element
         * @returns {HTMLElement|null}
         */
        $: (id) => document.getElementById(id),
        
        /**
         * Query Selector Wrapper
         * @param {string} sel - CSS Selector
         * @returns {HTMLElement|null}
         */
        qs: (sel) => document.querySelector(sel),

        /**
         * Query Selector All Wrapper
         * @param {string} sel - CSS Selector
         * @returns {NodeListOf<HTMLElement>}
         */
        qsa: (sel) => document.querySelectorAll(sel),

        /**
         * DOM Element Creator with fluent API capability
         * @param {string} tag - HTML Tag
         * @param {string} className - Class string
         * @param {object} attrs - Attributes map
         * @param {string|HTMLElement} content - Inner content
         */
        create: (tag, className = '', attrs = {}, content = null) => {
            const el = document.createElement(tag);
            if (className) el.className = className;
            
            Object.entries(attrs).forEach(([k, v]) => {
                if (k.startsWith('on') && typeof v === 'function') {
                    el.addEventListener(k.substring(2).toLowerCase(), v);
                } else if (k === 'dataset') {
                    Object.entries(v).forEach(([dK, dV]) => el.dataset[dK] = dV);
                } else {
                    el.setAttribute(k, v);
                }
            });

            if (content) {
                if (content instanceof HTMLElement) el.appendChild(content);
                else el.innerHTML = content;
            }
            return el;
        },

        /**
         * Format bytes to human readable string (KB, MB, GB)
         */
        formatSize: (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        /**
         * Format seconds to HH:MM:SS or MM:SS
         */
        formatDuration: (seconds) => {
            if (!seconds && seconds !== 0) return '-';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            
            if (h > 0) return `${h}h ${m}m ${s}s`;
            return `${m}m ${s}s`;
        },

        /**
         * Get file extension from filename securely
         */
        getExt: (filename) => {
            if (!filename) return '';
            return filename.split('.').pop().toLowerCase();
        },

        /**
         * Determine file category based on extension
         * @returns {'video'|'audio'|'image'|'unknown'}
         */
        getFileType: (filename) => {
            const ext = Utils.getExt(filename);
            if (CONFIG.EXTENSIONS.VIDEO.has(ext)) return 'video';
            if (CONFIG.EXTENSIONS.AUDIO.has(ext)) return 'audio';
            if (CONFIG.EXTENSIONS.IMAGE.has(ext)) return 'image';
            return 'unknown';
        },

        /**
         * Format timestamp to local date string
         */
        formatDate: (timestamp) => {
            if (!timestamp) return 'Nieznana';
            const date = new Date(timestamp);
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            
            if (isToday) {
                return `Dziś, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }
            return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        },

        /**
         * Debounce function for search inputs
         */
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Sanitize string for use in IDs
         */
        safeId: (str) => {
            return str.replace(/[^a-zA-Z0-9]/g, '_');
        }
    };

    // ==========================================================================
    // 4. CLIENT-SIDE THUMBNAIL ENGINE
    // ==========================================================================

    const ThumbnailEngine = {
        queue: [],
        processing: false,
        
        // In-memory cache for Blob URLs (fastest)
        memoryCache: new Map(),

        /**
         * Generates a unique fingerprint for a file.
         * Combines name + size + lastModified to detect belonging.
         * @param {File} file 
         */
        getFingerprint: (file) => {
            return `${file.name}_${file.size}_${file.lastModified}`;
        },

        /**
         * Checks if a thumbnail exists (Memory or SessionStorage)
         */
        get: (file) => {
            const key = ThumbnailEngine.getFingerprint(file);
            
            // 1. Check Memory Cache
            if (ThumbnailEngine.memoryCache.has(key)) {
                return ThumbnailEngine.memoryCache.get(key);
            }

            // 2. Check Session Storage (Base64)
            try {
                const stored = sessionStorage.getItem(CONFIG.CACHE_KEY_PREFIX + key);
                if (stored) {
                    // Promote to memory cache for faster subsequent access
                    ThumbnailEngine.memoryCache.set(key, stored);
                    return stored;
                }
            } catch (e) {
                console.warn('SessionStorage access failed', e);
            }

            return null;
        },

        /**
         * Stores thumbnail in caches
         */
        store: (file, dataUrl) => {
            const key = ThumbnailEngine.getFingerprint(file);
            
            // Save to memory
            ThumbnailEngine.memoryCache.set(key, dataUrl);

            // Save to session storage (persistence across tabs/reloads)
            try {
                sessionStorage.setItem(CONFIG.CACHE_KEY_PREFIX + key, dataUrl);
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    console.warn('SessionStorage quota exceeded. Clearing old thumbnails...');
                    ThumbnailEngine.pruneStorage();
                }
            }
        },

        /**
         * Clears old thumbnails to free up space
         */
        pruneStorage: () => {
            // Simple heuristic: clear everything that looks like our key
            Object.keys(sessionStorage).forEach(k => {
                if (k.startsWith(CONFIG.CACHE_KEY_PREFIX)) {
                    sessionStorage.removeItem(k);
                }
            });
        },

        /**
         * Queues files for thumbnail generation
         */
        queueFiles: (fileList) => {
            fileList.forEach(file => {
                // Skip if already cached or processing
                if (!ThumbnailEngine.get(file)) {
                    ThumbnailEngine.queue.push(file);
                }
            });
            ThumbnailEngine.processQueue();
        },

        /**
         * Sequential processing loop
         */
        processQueue: async () => {
            if (ThumbnailEngine.processing || ThumbnailEngine.queue.length === 0) return;

            ThumbnailEngine.processing = true;
            const file = ThumbnailEngine.queue.shift();

            try {
                const type = Utils.getFileType(file.name);
                let thumbData = null;

                // Update UI to "Generating..." state
                ThumbnailEngine.updateCardStatus(file, 'generating');

                if (type === 'video') {
                    thumbData = await ThumbnailEngine.generateFromVideo(file);
                } else if (type === 'image') {
                    thumbData = await ThumbnailEngine.generateFromImage(file);
                }

                if (thumbData) {
                    ThumbnailEngine.store(file, thumbData);
                    ThumbnailEngine.updateCardStatus(file, 'done', thumbData);
                } else {
                    ThumbnailEngine.updateCardStatus(file, 'error');
                }

            } catch (err) {
                console.error(`Thumbnail Error [${file.name}]:`, err);
                ThumbnailEngine.updateCardStatus(file, 'error');
            } finally {
                ThumbnailEngine.processing = false;
                // Small delay to allow UI to breathe
                setTimeout(() => ThumbnailEngine.processQueue(), 50);
            }
        },

        updateCardStatus: (file, status, dataUrl = null) => {
            // Find the pending card in DOM
            // Pending cards are generated in 'pending' context
            // Their IDs are based on index, but we can search by filename match if we added dataset
            // For robustness, let's look for specific element
            
            // In CardFactory, we will add a data-signature attribute to pending cards
            const signature = ThumbnailEngine.getFingerprint(file);
            const card = document.querySelector(`.file-card[data-signature="${CSS.escape(signature)}"]`);
            
            if (!card) return;

            const thumbContainer = card.querySelector('.file-thumbnail');
            
            if (status === 'generating') {
                thumbContainer.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;color:var(--primary-light);"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>`;
            } else if (status === 'done' && dataUrl) {
                thumbContainer.classList.remove('no-preview');
                thumbContainer.innerHTML = `<img src="${dataUrl}" class="fade-in" style="width:100%;height:100%;object-fit:cover;">`;
            } else if (status === 'error') {
                thumbContainer.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;color:var(--text-muted);"><i class="fas fa-file-excel fa-2x"></i></div>`;
            }
        },

        generateFromVideo: (file) => {
            return new Promise((resolve) => {
                const video = document.createElement('video');
                const canvas = document.createElement('canvas');
                const url = URL.createObjectURL(file);

                video.preload = 'metadata';
                video.src = url;
                video.muted = true;
                video.playsInline = true;
                video.currentTime = CONFIG.THUMBNAILS.VIDEO_SEEK_TIME;

                video.onloadeddata = () => {
                    // Try to seek again just in case
                    if (video.currentTime === 0) video.currentTime = CONFIG.THUMBNAILS.VIDEO_SEEK_TIME;
                };

                video.onseeked = () => {
                    // Draw
                    canvas.width = CONFIG.THUMBNAILS.WIDTH;
                    canvas.height = (video.videoHeight / video.videoWidth) * canvas.width;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    
                    const data = canvas.toDataURL('image/jpeg', CONFIG.THUMBNAILS.QUALITY);
                    
                    // Cleanup
                    URL.revokeObjectURL(url);
                    resolve(data);
                };

                video.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };
            });
        },

        generateFromImage: (file) => {
            return new Promise((resolve) => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Resize to thumbnail size to save memory
                    const scale = CONFIG.THUMBNAILS.WIDTH / img.width;
                    canvas.width = CONFIG.THUMBNAILS.WIDTH;
                    canvas.height = img.height * scale;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const data = canvas.toDataURL('image/jpeg', CONFIG.THUMBNAILS.QUALITY);
                    URL.revokeObjectURL(url);
                    resolve(data);
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };

                img.src = url;
            });
        }
    };

    // ==========================================================================
    // 5. NOTIFICATION SYSTEM (TOASTS)
    // ==========================================================================

    const Toaster = {
        timeout: null,

        /**
         * Show a global notification
         * @param {string} message 
         * @param {'success'|'error'|'info'} type 
         */
        show: (message, type = 'info') => {
            const container = Utils.$('toastContainer');
            const toast = Utils.create('div', `toast ${type}`, {}, `
                <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                <span>${message}</span>
            `);

            container.appendChild(toast);

            // Trigger reflow for transition
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });

            // Remove after delay
            setTimeout(() => {
                toast.classList.remove('show');
                toast.addEventListener('transitionend', () => toast.remove());
            }, CONFIG.TIMING.TOAST_DURATION);
        }
    };

    // ==========================================================================
    // 6. API INTERFACE LAYER
    // ==========================================================================

    const API = {
        /**
         * Generic Fetch Wrapper with Error Handling
         */
        async request(url, method = 'GET', body = null, type = 'json') {
            const options = { method };
            if (body) {
                if (body instanceof FormData) {
                    options.body = body; // Content-Type auto-set
                } else {
                    options.headers = { 'Content-Type': 'application/json' };
                    options.body = JSON.stringify(body);
                }
            }

            try {
                const res = await fetch(url, options);
                if (!res.ok) {
                    // Try to parse error message from JSON
                    let errMsg = `HTTP Error ${res.status}`;
                    try {
                        const errJson = await res.json();
                        if (errJson.error) errMsg = errJson.error;
                    } catch (e) {} // Fallback to status text
                    throw new Error(errMsg);
                }
                
                if (type === 'blob') return await res.blob();
                return await res.json();
            } catch (err) {
                console.error(`API Error [${url}]:`, err);
                throw err;
            }
        },

        getFiles: () => API.request(CONFIG.ENDPOINTS.FILES),
        
        getMetadata: (fileName, context) => 
            API.request(`${CONFIG.ENDPOINTS.METADATA}/${context}/${encodeURIComponent(fileName)}`),
        
        deleteFile: (fileName, context) => 
            API.request(`${CONFIG.ENDPOINTS.DELETE}/${encodeURIComponent(fileName)}/${context}`, 'DELETE'),
        
        startConversion: (formData) => API.request(CONFIG.ENDPOINTS.CONVERT, 'POST', formData),
        
        /**
         * Download file trigger
         */
        download: (fileName) => {
            const link = document.createElement('a');
            link.href = `${CONFIG.ENDPOINTS.DOWNLOAD}/${encodeURIComponent(fileName)}`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        /**
         * Upload with Progress (XHR)
         */
        upload: (files, onProgress) => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const formData = new FormData();
                
                files.forEach(f => formData.append('files', f));

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        const percent = (e.loaded / e.total) * 100;
                        onProgress(percent);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve(response);
                        } catch (e) {
                            reject(new Error("Invalid JSON response from server"));
                        }
                    } else {
                        reject(new Error(`Upload failed: ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error("Network error during upload")));
                xhr.open('POST', CONFIG.ENDPOINTS.UPLOAD, true);
                xhr.send(formData);
            });
        }
    };

    // ==========================================================================
    // 7. PERSISTENCE LAYER
    // ==========================================================================

    const Persistence = {
        load: () => {
            try {
                const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    
                    // Merge recursively to handle schema updates
                    state.settings = { ...defaultState.settings, ...parsed.settings };
                    state.sidebarCollapsed = parsed.sidebarCollapsed || false;
                    
                    // Note: We don't restore tabs or selections, as file lists might have changed
                    console.log('[Persistence] Settings loaded');
                }
            } catch (e) {
                console.warn('[Persistence] Failed to load settings', e);
            }
        },

        save: () => {
            const dump = {
                settings: state.settings,
                sidebarCollapsed: state.sidebarCollapsed
            };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(dump));
        },

        /**
         * Synchronize UI inputs with State
         */
        syncUI: () => {
            const s = state.settings;
            const dom = CONFIG.DOM.SETTINGS;
            
            const setVal = (id, val) => {
                const el = Utils.$(id);
                if (el) el.value = val;
                // If it's the range slider, also update the output sibling
                if (el && el.type === 'range' && el.nextElementSibling) {
                    el.nextElementSibling.value = val;
                }
            };

            setVal(dom.FORMAT, s.defaultFormat);
            setVal(dom.CRF, s.defaultCrf);
            setVal(dom.SORT, s.sortBy);
            setVal(dom.THEME, s.theme);
        }
    };

    // ==========================================================================
    // 8. HEADER & TOOLBAR MANAGER
    // ==========================================================================

    const HeaderManager = {
        /**
         * Updates the entire header based on current context
         */
        update: () => {
            const tab = state.currentTab;
            
            // 1. Update Title
            const titles = {
                'pending': 'Do wgrania',
                'uploads': 'Biblioteka',
                'converted': 'Gotowe pliki',
                'settings': 'Konfiguracja'
            };
            const icons = {
                'pending': 'fa-cloud-upload-alt',
                'uploads': 'fa-folder-open',
                'converted': 'fa-check-circle',
                'settings': 'fa-cog'
            };

            Utils.$(CONFIG.DOM.HEADER.TITLE).textContent = titles[tab] || 'MediaFlow';
            Utils.$(CONFIG.DOM.HEADER.ICON).className = `fas ${icons[tab] || 'fa-layer-group'}`;

            // 2. Manage Batch Actions Visibility
            const batchGroup = Utils.$(CONFIG.DOM.HEADER.BATCH_GROUP);
            const selectedCount = state.selection[tab] ? state.selection[tab].size : 0;
            const selectAllBtn = Utils.$(CONFIG.DOM.HEADER.BTN_SELECT_ALL);

            // Hide actions for Pending/Settings tabs
            if (tab === 'pending' || tab === 'settings') {
                batchGroup.classList.add('disabled');
                batchGroup.style.opacity = '0';
                batchGroup.style.pointerEvents = 'none';
                
                // Also hide/disable Select All
                selectAllBtn.style.opacity = '0';
                selectAllBtn.style.pointerEvents = 'none';
            } else {
                // Show Select All for list tabs
                selectAllBtn.style.opacity = '1';
                selectAllBtn.style.pointerEvents = 'all';
                HeaderManager.updateSelectAllBtn(tab);

                // Batch Actions State
                if (selectedCount > 0) {
                    batchGroup.classList.remove('disabled');
                    batchGroup.style.opacity = '1';
                    batchGroup.style.pointerEvents = 'all';
                } else {
                    batchGroup.classList.add('disabled');
                    batchGroup.style.opacity = '0.3';
                    batchGroup.style.pointerEvents = 'none';
                }
            }

            // 3. Context Specific Buttons
            const btnConvert = Utils.$(CONFIG.DOM.HEADER.BTN_CONVERT);
            const btnDownload = Utils.$(CONFIG.DOM.HEADER.BTN_DOWNLOAD);

            // Reset classes
            if (btnConvert) btnConvert.classList.add('hidden-action');
            if (btnDownload) btnDownload.classList.add('hidden-action');

            if (tab === 'uploads') {
                if (btnConvert) btnConvert.classList.remove('hidden-action');
            } else if (tab === 'converted') {
                if (btnDownload) btnDownload.classList.remove('hidden-action');
            }
        },

        /**
         * Updates the look of the Select All button
         */
        updateSelectAllBtn: (context) => {
            const btn = Utils.$(CONFIG.DOM.HEADER.BTN_SELECT_ALL);
            if (!btn) return;

            const icon = btn.querySelector('i');
            const text = btn.querySelector('span');
            
            // Determine if all VISIBLE items are selected
            const visibleItems = ListRenderer.getProcessedList(context);
            if (visibleItems.length === 0) {
                icon.className = 'far fa-square';
                text.textContent = 'Zaznacz wszystko';
                return;
            }

            const allSelected = visibleItems.every(f => state.selection[context].has(f.name));

            if (allSelected) {
                icon.className = 'far fa-check-square';
                text.textContent = 'Odznacz wszystko';
            } else {
                icon.className = 'far fa-square';
                text.textContent = 'Zaznacz wszystko';
            }
        }
    };

    // ==========================================================================
    // 9. CARD FACTORY & LIST RENDERER
    // ==========================================================================

    const CardFactory = {
        /**
         * Generates HTML for a File Card
         * @param {object} file - File metadata or File object
         * @param {string} context - 'pending', 'uploads', 'converted'
         * @param {number} index - Index for pending array
         */
        create: (file, context, index) => {
            const isServer = context !== 'pending';
            const fileName = isServer ? file.name : file.name;
            const size = isServer ? file.size : file.size;
            
            // Unique Identifier for DOM
            const safeId = Utils.safeId(fileName);
            
            // Determine state
            const isSelected = isServer ? state.selection[context].has(fileName) : false;
            const convData = state.activeConversions[fileName];
            const isConverting = !!convData;
            const progress = convData ? convData.percent : 0;
            const type = Utils.getFileType(fileName);

            // 1. Thumbnail
            let thumbContent = '';
            let thumbClass = 'file-thumbnail';
            
            if (isServer) {
                // SERVER FILES (Already on disk)
                const src = `/media/${context}/${encodeURIComponent(fileName)}`;
                if (type === 'video') {
                    // Preload metadata only to save bandwidth, show first frame
                    thumbContent = `<video src="${src}#t=0.5" muted preload="metadata" playsinline></video>`;
                } else if (type === 'image') {
                    thumbContent = `<img src="${src}" loading="lazy" alt="${fileName}">`;
                } else {
                    const icon = type === 'audio' ? 'fa-music' : 'fa-file-alt';
                    thumbContent = `<i class="fas ${icon}" style="font-size: 3rem; opacity: 0.5;"></i>`;
                    thumbClass += ' no-preview';
                }
            } else {
                // PENDING FILES (Client side)
                const cachedThumb = ThumbnailEngine.get(file);
                
                if (cachedThumb) {
                    thumbContent = `<img src="${cachedThumb}" class="fade-in" style="width:100%;height:100%;object-fit:cover;">`;
                } else {
                    // Check if supported media type
                    const isMedia = CONFIG.EXTENSIONS.VIDEO.has(Utils.getExt(file.name)) || 
                                    CONFIG.EXTENSIONS.IMAGE.has(Utils.getExt(file.name));
                    
                    if (isMedia) {
                        // Will be filled by ThumbnailEngine
                        thumbContent = `<div style="display:flex;justify-content:center;align-items:center;height:100%;color:var(--text-muted);"><i class="fas fa-image"></i></div>`;
                    } else {
                        // Generic icon
                        const icon = type === 'audio' ? 'fa-music' : 'fa-file-alt';
                        thumbContent = `<i class="fas ${icon}" style="font-size: 3rem; opacity: 0.5;"></i>`;
                        thumbClass += ' no-preview';
                    }
                }
            }

            // 2. Action Buttons (Prevent propagation in HTML)
            let actionsHtml = '';
            
            // Define actions based on context
            if (context === 'pending') {
                actionsHtml = `
                    <button class="file-action-btn file-action-danger" onclick="event.stopPropagation(); Logic.removePending(${index})" title="Usuń z kolejki">
                        <i class="fas fa-trash"></i> Usuń
                    </button>
                `;
            } else {
                const infoBtn = `
                    <button class="file-action-btn btn-secondary" onclick="event.stopPropagation(); Modals.details('${fileName}', '${context}')" title="Szczegóły">
                        <i class="fas fa-info"></i>
                    </button>
                `;

                let mainBtn = '';
                if (context === 'uploads') {
                    mainBtn = `
                        <button class="file-action-btn file-action-primary" onclick="event.stopPropagation(); Modals.convert(['${fileName}'])" title="Konwertuj">
                            <i class="fas fa-magic"></i> Konw.
                        </button>
                    `;
                } else {
                    mainBtn = `
                        <button class="file-action-btn file-action-download" onclick="event.stopPropagation(); API.download('${fileName}')" title="Pobierz">
                            <i class="fas fa-download"></i> Pobierz
                        </button>
                    `;
                }

                const deleteBtn = `
                    <button class="file-action-btn file-action-danger" onclick="event.stopPropagation(); Logic.deleteFile('${fileName}', '${context}')" title="Usuń">
                        <i class="fas fa-trash"></i>
                    </button>
                `;

                actionsHtml = infoBtn + mainBtn + deleteBtn;
            }

            // 3. Progress Bar (Conversion)
            const progressDisplay = isConverting ? 'block' : 'none';
            const progressHtml = `
                <div class="progress-bar-container" id="prog-wrap-${safeId}" style="display: ${progressDisplay}; margin-top:5px;">
                    <div class="file-meta" style="margin-bottom: 2px;">
                        <small class="text-accent">Przetwarzanie...</small>
                        <small id="prog-text-${safeId}" class="text-accent">${progress}%</small>
                    </div>
                    <div class="progress-bar" style="height: 4px;">
                        <div class="progress-fill" id="prog-fill-${safeId}" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;

            // 4. Checkbox
            // Important: onclick stops propagation to prevent double-toggling via card click
            const checkboxHtml = isServer ? `
                <input type="checkbox" class="file-checkbox" 
                    ${isSelected ? 'checked' : ''} 
                    onchange="Logic.toggleSelection('${context}', '${fileName}', this.checked)"
                    onclick="event.stopPropagation()">
            ` : '';

            // 5. Play Overlay
            // Only show for server files that are viewable, or pending files that have thumbs
            const hasThumb = !isServer && ThumbnailEngine.get(file);
            const canPreview = (isServer && (type === 'video' || type === 'image')) || hasThumb;
            
            const overlayHtml = canPreview ? `
                <div class="file-overlay" onclick="event.stopPropagation(); Modals.player('${fileName}', '${context}', ${isServer ? 'false' : index})">
                    <i class="fas ${type === 'video' ? 'fa-play' : 'fa-search-plus'}"></i>
                </div>
            ` : '';

            // 6. Build Element
            // We use string interpolation for performance in large lists, but wrap in a container
            const div = document.createElement('div');
            div.className = `file-card ${isSelected ? 'selected' : ''}`;
            div.dataset.filename = fileName;
            div.dataset.context = context;
            
            // Add fingerprint to dataset for pending files so ThumbnailEngine can find it
            if (!isServer) {
                div.dataset.signature = ThumbnailEngine.getFingerprint(file);
            }
            
            // CLICK HANDLER: Clicking anywhere on the card toggles selection
            if (isServer) {
                div.onclick = () => Logic.toggleCardClick(context, fileName);
            }

            div.innerHTML = `
                ${checkboxHtml}
                <div class="${thumbClass}">
                    ${thumbContent}
                    ${overlayHtml}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${fileName}">${fileName}</div>
                    <div class="file-meta">
                        <span><i class="fas fa-hdd"></i> ${Utils.formatSize(size)}</span>
                        <span>${isServer ? Utils.formatDate(file.lastModified) : 'Ready'}</span>
                    </div>
                    ${progressHtml}
                    <div class="file-actions">
                        ${actionsHtml}
                    </div>
                </div>
            `;

            return div;
        }
    };

    const ListRenderer = {
        /**
         * Filters and Sorts files based on current state settings
         */
        getProcessedList: (context) => {
            let files = state[context] || [];

            // 1. Filter by Search
            const query = state.searchQuery.toLowerCase();
            if (query) {
                files = files.filter(f => f.name.toLowerCase().includes(query));
            }

            // 2. Sort
            const sortBy = state.settings.sortBy;
            return [...files].sort((a, b) => {
                if (sortBy === 'name') return a.name.localeCompare(b.name);
                if (sortBy === 'size') return b.size - a.size;
                // Default: Date Descending (Newest first)
                const dateA = a.lastModified || 0;
                const dateB = b.lastModified || 0;
                return dateB - dateA;
            });
        },

        /**
         * Renders a specific list into the DOM
         */
        render: (context) => {
            const listId = CONFIG.DOM.LISTS[context.toUpperCase()];
            const emptyId = CONFIG.DOM.EMPTY_STATES[context.toUpperCase()];
            
            const container = Utils.$(listId);
            const emptyEl = Utils.$(emptyId);

            if (!container) return;

            const items = context === 'pending' ? state.pendingFiles : ListRenderer.getProcessedList(context);

            // Handle Empty State
            if (items.length === 0) {
                container.innerHTML = '';
                if (emptyEl) emptyEl.style.display = 'flex';
            } else {
                if (emptyEl) emptyEl.style.display = 'none';
                
                // Use Fragment for batch insertion (Performance)
                const fragment = document.createDocumentFragment();
                items.forEach((item, idx) => {
                    fragment.appendChild(CardFactory.create(item, context, idx));
                });
                
                // Simple Diffing: If content is vastly different, replace.
                // For a truly huge app, we'd use a virtual DOM lib, but replacing innerHTML is okay for <1000 items.
                container.innerHTML = '';
                container.appendChild(fragment);
            }

            // Update Counts in Sidebar (for pending)
            if (context === 'pending') {
                const badge = Utils.$(CONFIG.DOM.NAV_BADGES.PENDING);
                if (badge) {
                    badge.textContent = items.length;
                    badge.style.display = items.length > 0 ? 'inline-block' : 'none';
                }
                
                // Update Label in Pending Tab
                const countLabel = Utils.$(CONFIG.DOM.UPLOAD.COUNT_LABEL);
                if (countLabel) countLabel.textContent = `(${items.length})`;

                // Update Action Bar Visibility
                const actionBar = Utils.$(CONFIG.DOM.UPLOAD.ACTION_BAR);
                const clearBtn = Utils.$(CONFIG.DOM.UPLOAD.CLEAR_BTN);
                
                if (items.length > 0) {
                    actionBar.classList.add('show');
                    if(clearBtn) clearBtn.style.display = 'inline-block';
                    
                    // Calc total size
                    const totalSize = items.reduce((acc, f) => acc + f.size, 0);
                    Utils.$(CONFIG.DOM.UPLOAD.TOTAL_SIZE).textContent = Utils.formatSize(totalSize);
                } else {
                    actionBar.classList.remove('show');
                    if(clearBtn) clearBtn.style.display = 'none';
                }
            }

            // Update Header if active
            if (state.currentTab === context) {
                HeaderManager.update();
            }
        },

        /**
         * Updates a specific progress bar without re-rendering the whole list
         */
        updateProgress: (fileName, percent) => {
            const safeId = Utils.safeId(fileName);
            const wrap = Utils.$(`prog-wrap-${safeId}`);
            const fill = Utils.$(`prog-fill-${safeId}`);
            const text = Utils.$(`prog-text-${safeId}`);

            if (!wrap) return; // Card might not be in DOM (e.g. wrong tab)

            if (percent === null) {
                // Done or Error - Hide bar
                wrap.style.display = 'none';
            } else {
                wrap.style.display = 'block';
                if (fill) fill.style.width = `${percent}%`;
                if (text) text.innerText = `${Math.round(percent)}%`;
            }
        },

        /**
         * Renders all active lists
         */
        renderAll: () => {
            ListRenderer.render('pending');
            ListRenderer.render('uploads');
            ListRenderer.render('converted');
        }
    };

    // ==========================================================================
    // 10. MODAL & PLAYER MANAGER
    // ==========================================================================

    const Modals = {
        /**
         * Generic Open
         */
        open: (id) => {
            const el = Utils.$(id);
            if (el) el.classList.add('show');
        },

        closeAll: () => {
            Utils.qsa('.modal').forEach(m => m.classList.remove('show'));
            // Pause any video players
            const container = Utils.$(CONFIG.DOM.PLAYER.CONTAINER);
            if(container) container.innerHTML = ''; 
        },

        /**
         * Open Details Modal with Metadata
         */
        details: async (fileName, context) => {
            const body = Utils.$('detailsBody');
            Modals.open(CONFIG.DOM.MODALS.DETAILS);
            
            body.innerHTML = `
                <div class="text-center" style="padding: 2rem; color: var(--text-muted);">
                    <i class="fas fa-circle-notch fa-spin fa-2x"></i><br><br>
                    Analizowanie pliku...
                </div>
            `;

            try {
                const meta = await API.getMetadata(fileName, context);
                
                if (!meta) throw new Error('Brak danych');

                // Helper for row generation
                const row = (label, val) => `
                    <div class="detail-item">
                        <span class="detail-label">${label}</span>
                        <div class="detail-value">${val !== undefined ? val : '-'}</div>
                    </div>
                `;

                let html = `<div class="details-grid">`;
                html += row('Format', meta.format_name);
                html += row('Czas', Utils.formatDuration(meta.duration));
                html += row('Rozmiar', Utils.formatSize(meta.size));
                html += row('Bitrate', meta.bitrate ? Math.round(meta.bitrate / 1024) + ' kbps' : '-');

                if (meta.video) {
                    html += `<div style="grid-column: span 2; margin-top: 1rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; color: var(--primary-light); font-weight: 700;">Wideo</div>`;
                    html += row('Kodek', meta.video.codec);
                    html += row('Wymiary', `${meta.video.width}x${meta.video.height}`);
                    html += row('FPS', meta.video.fps);
                    html += row('Profil', meta.video.profile);
                }

                if (meta.audio) {
                    html += `<div style="grid-column: span 2; margin-top: 1rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; color: var(--primary-light); font-weight: 700;">Audio</div>`;
                    html += row('Kodek', meta.audio.codec);
                    html += row('Kanały', meta.audio.channels);
                    html += row('Próbkowanie', `${meta.audio.sampleRate} Hz`);
                    html += row('Język', meta.audio.lang);
                }
                html += `</div>`;
                
                body.innerHTML = html;

            } catch (e) {
                body.innerHTML = `
                    <div class="empty-state" style="padding: 1rem;">
                        <i class="fas fa-exclamation-circle text-danger" style="font-size:2rem; margin-bottom:1rem;"></i>
                        <p>Nie udało się pobrać metadanych.</p>
                    </div>
                `;
            }
        },

        /**
         * Open Convert Modal
         * @param {string[]} files - Array of filenames
         */
        convert: (files) => {
            if (!files || files.length === 0) return;
            
            Utils.$(CONFIG.DOM.CONVERT_FORM.TARGETS).value = JSON.stringify(files);
            
            // Update Title
            const titleEl = Utils.qs(`#${CONFIG.DOM.MODALS.CONVERT} .modal-title span`);
            if (titleEl) titleEl.textContent = `Konfiguracja: ${files.length} plik(ów)`;

            // Reset form to defaults from settings
            const form = Utils.$(CONFIG.DOM.CONVERT_FORM.FORM);
            form.reset();
            
            // Set Format Radio
            const radios = form.querySelectorAll('input[name="formatRadio"]');
            radios.forEach(r => r.checked = (r.value === state.settings.defaultFormat));
            
            // Set CRF
            Utils.$(CONFIG.DOM.CONVERT_FORM.CRF).value = state.settings.defaultCrf;
            
            Modals.open(CONFIG.DOM.MODALS.CONVERT);
        },

        /**
         * Open Player Modal
         * Handles both server-side streams and client-side blobs (pending files)
         * @param {string} fileName - Name of file
         * @param {string} context - 'uploads', 'converted', or 'pending'
         * @param {number|null} pendingIndex - Index in pending array if context is pending
         */
        player: (fileName, context, pendingIndex = null) => {
            const container = Utils.$(CONFIG.DOM.PLAYER.CONTAINER);
            const title = Utils.$(CONFIG.DOM.PLAYER.TITLE);
            const dlBtn = Utils.$(CONFIG.DOM.PLAYER.DOWNLOAD_BTN);
            
            title.textContent = fileName;
            
            let src, type;

            if (context === 'pending') {
                // Handle Pending File (Blob)
                const file = state.pendingFiles[pendingIndex];
                if (!file) return;
                
                src = URL.createObjectURL(file);
                type = Utils.getFileType(file.name);
                
                // Hide download button for pending
                dlBtn.style.display = 'none';
                
                // Note: We need to revoke this URL later to avoid leaks, 
                // but since modal destroys content on close, it's acceptable for short viewing
            } else {
                // Handle Server File
                src = `/media/${context}/${encodeURIComponent(fileName)}`;
                type = Utils.getFileType(fileName);
                dlBtn.style.display = 'inline-flex';
                dlBtn.onclick = () => API.download(fileName);
            }

            if (type === 'video') {
                container.innerHTML = `
                    <video controls autoplay name="media" style="width:100%; max-height:80vh;">
                        <source src="${src}">
                        Twoja przeglądarka nie obsługuje tego wideo.
                    </video>
                `;
            } else if (type === 'image') {
                container.innerHTML = `
                    <img src="${src}" style="max-width:100%; max-height:80vh; object-fit:contain;">
                `;
            } else {
                Toaster.show('Podgląd niedostępny', 'info');
                return;
            }

            Modals.open(CONFIG.DOM.MODALS.PLAYER);
        }
    };

    // ==========================================================================
    // 11. BUSINESS LOGIC HANDLERS
    // ==========================================================================

    const Logic = {
        /**
         * Tab Switching Logic
         */
        openTab: (tabId) => {
            state.currentTab = tabId;

            // DOM Updates
            Utils.qsa('.tabcontent').forEach(el => el.classList.remove('active'));
            Utils.qsa('.tablinks').forEach(el => el.classList.remove('active'));

            const content = Utils.$(tabId);
            if (content) content.classList.add('active');

            // Find button by onclick attribute content
            const btns = Utils.qsa('.tablinks');
            for (let btn of btns) {
                if (btn.getAttribute('onclick').includes(`'${tabId}'`)) {
                    btn.classList.add('active');
                    break;
                }
            }

            // Sync Settings UI if entering settings
            if (tabId === 'settings') {
                Persistence.syncUI();
            }

            // Trigger list refresh (lazy load)
            if (tabId !== 'settings') {
                Logic.refreshLists(false);
            }
            
            HeaderManager.update();
        },

        /**
         * Data Refresh Strategy
         */
        refreshLists: async (force = false) => {
            try {
                const icon = Utils.$('refreshIcon');
                if (icon && force) icon.classList.add('fa-spin');

                const data = await API.getFiles();
                
                // --- FIX v2: Sortowanie i Porównywanie ---
                
                // Funkcja pomocnicza: tworzy unikalny podpis listy plików
                // Najpierw sortuje pliki po nazwie, żeby kolejność z serwera nie miała znaczenia
                const generateHash = (arr) => {
                    if (!arr) return '';
                    // Kopiujemy tablicę [...arr] żeby nie psuć oryginału, sortujemy i mapujemy
                    const sorted = [...arr].sort((a, b) => a.name.localeCompare(b.name));
                    return JSON.stringify(sorted.map(f => f.name + '_' + f.size + '_' + f.lastModified));
                };
                
                const currentHash = generateHash([...state.uploads, ...state.converted]);
                const newHash = generateHash([...(data.uploads || []), ...(data.converted || [])]);

                // Jeśli podpisy są identyczne, NIC nie róbimy (nie dotykamy DOM)
                if (!force && currentHash === newHash) {
                    return;
                }
                // --- FIX END ---

                state.uploads = data.uploads || [];
                state.converted = data.converted || [];

                // Cleanup Selections
                const validateSelection = (list, set) => {
                    const names = new Set(list.map(f => f.name));
                    Array.from(set).forEach(name => {
                        if (!names.has(name)) set.delete(name);
                    });
                };
                
                validateSelection(state.uploads, state.selection.uploads);
                validateSelection(state.converted, state.selection.converted);

                ListRenderer.renderAll();

                if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 500);

            } catch (e) {
                console.error(e);
                if(force) Toaster.show('Błąd odświeżania listy', 'error');
            }
        },

        /**
         * Handle Files Added via Input or Drop
         */
        addPendingFiles: (fileList) => {
            const validFiles = Array.from(fileList).filter(f => {
                const ext = Utils.getExt(f.name);
                return CONFIG.EXTENSIONS.VIDEO.has(ext) || 
                       CONFIG.EXTENSIONS.AUDIO.has(ext) || 
                       CONFIG.EXTENSIONS.IMAGE.has(ext);
            });

            if (validFiles.length === 0) {
                Toaster.show('Brak obsługiwanych plików w wyborze.', 'warning');
                return;
            }

            const rejected = fileList.length - validFiles.length;
            if (rejected > 0) {
                Toaster.show(`Pominięto ${rejected} nieobsługiwanych plików.`, 'info');
            }

            state.pendingFiles = [...state.pendingFiles, ...validFiles];
            
            // Trigger UI Update
            ListRenderer.render('pending');
            Logic.openTab('pending');

            // Trigger Thumbnail Generation in Background
            ThumbnailEngine.queueFiles(validFiles);
        },

        removePending: (index) => {
            state.pendingFiles.splice(index, 1);
            ListRenderer.render('pending');
        },

        clearPending: () => {
            if(confirm('Wyczyścić kolejkę?')) {
                state.pendingFiles = [];
                ListRenderer.render('pending');
            }
        },

        /**
         * Upload Execution Logic
         */
        startUpload: async () => {
            if (state.pendingFiles.length === 0) return;
            if (state.isUploading) return;

            state.isUploading = true;
            
            const btn = Utils.$(CONFIG.DOM.UPLOAD.START_BTN);
            const progressFill = Utils.$(CONFIG.DOM.UPLOAD.PROGRESS_FILL);
            const originalText = btn.innerHTML;

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Wysyłanie...';

            try {
                await API.upload(state.pendingFiles, (percent) => {
                    state.uploadProgress = percent;
                    if (progressFill) progressFill.style.width = `${percent}%`;
                });

                Toaster.show(`Wgrano pomyślnie ${state.pendingFiles.length} plików!`, 'success');
                state.pendingFiles = []; // Clear queue
                
                // Switch to library
                Logic.openTab('uploads');
                Logic.refreshLists(true);

            } catch (e) {
                Toaster.show('Błąd wysyłania: ' + e.message, 'error');
                if (progressFill) progressFill.style.backgroundColor = 'var(--error-color)';
            } finally {
                state.isUploading = false;
                state.uploadProgress = 0;
                btn.disabled = false;
                btn.innerHTML = originalText;
                if(progressFill) {
                    progressFill.style.width = '0%';
                    progressFill.style.backgroundColor = '';
                }
                ListRenderer.render('pending'); // Will hide action bar
            }
        },

        /**
         * Toggle Selection Logic (Context Aware)
         */
        toggleSelection: (context, fileName, isChecked) => {
            const set = state.selection[context];
            if (isChecked) set.add(fileName);
            else set.delete(fileName);

            // Update UI Card Class
            // Find card by dataset to avoid ID issues with weird filenames
            const card = document.querySelector(`.file-card[data-filename="${CSS.escape(fileName)}"][data-context="${context}"]`);
            if (card) {
                if (isChecked) card.classList.add('selected');
                else card.classList.remove('selected');
                
                // Sync checkbox if triggered by card click
                const cb = card.querySelector('.file-checkbox');
                if (cb) cb.checked = isChecked;
            }

            HeaderManager.update();
        },

        toggleCardClick: (context, fileName) => {
            const isSelected = state.selection[context].has(fileName);
            Logic.toggleSelection(context, fileName, !isSelected);
        },

        /**
         * Global Select All / Deselect All Logic
         */
        toggleSelectAll: () => {
            const context = state.currentTab;
            if (context !== 'uploads' && context !== 'converted') return;

            const set = state.selection[context];
            const visibleFiles = ListRenderer.getProcessedList(context); // Only select what's visible (search filtered)
            
            // Check if all currently visible are selected
            const allSelected = visibleFiles.length > 0 && visibleFiles.every(f => set.has(f.name));

            if (allSelected) {
                // Deselect All Visible
                visibleFiles.forEach(f => {
                    set.delete(f.name);
                    const card = document.querySelector(`.file-card[data-filename="${CSS.escape(f.name)}"][data-context="${context}"]`);
                    if(card) {
                        card.classList.remove('selected');
                        const cb = card.querySelector('.file-checkbox');
                        if(cb) cb.checked = false;
                    }
                });
            } else {
                // Select All Visible
                visibleFiles.forEach(f => {
                    set.add(f.name);
                    const card = document.querySelector(`.file-card[data-filename="${CSS.escape(f.name)}"][data-context="${context}"]`);
                    if(card) {
                        card.classList.add('selected');
                        const cb = card.querySelector('.file-checkbox');
                        if(cb) cb.checked = true;
                    }
                });
            }
            
            HeaderManager.update();
        },

        /**
         * Batch Operations
         */
        batchDelete: async () => {
            const context = state.currentTab;
            const set = state.selection[context];
            if (!set || set.size === 0) return;

            if (!confirm(`Czy na pewno usunąć ${set.size} plików? Operacja jest nieodwracalna.`)) return;

            let success = 0;
            const errors = [];
            const files = Array.from(set);

            // Execute serially to prevent server overload or parallel limitation
            for (const file of files) {
                try {
                    await API.deleteFile(file, context);
                    success++;
                } catch (e) {
                    errors.push(file);
                }
            }

            set.clear();
            Toaster.show(`Usunięto ${success} plików.`);
            if (errors.length > 0) console.warn('Failed deletes:', errors);
            
            Logic.refreshLists(true);
        },

        batchDownload: () => {
            const set = state.selection.converted;
            if (set.size === 0) return;
            
            if (set.size > 5 && !confirm(`Chcesz pobrać ${set.size} plików. Może to otworzyć wiele kart. Kontynuować?`)) return;

            let delay = 0;
            set.forEach(file => {
                setTimeout(() => API.download(file), delay);
                delay += 500;
            });
        },

        batchConvert: () => {
            const set = state.selection.uploads;
            if (set.size === 0) return;
            Modals.convert(Array.from(set));
        },

        deleteFile: async (name, context) => {
            if(!confirm('Usunąć plik trwale?')) return;
            try {
                await API.deleteFile(name, context);
                Toaster.show('Plik usunięty');
                Logic.refreshLists(true);
            } catch (e) {
                Toaster.show(e.message, 'error');
            }
        },

        /**
         * Handle Convert Form Submission
         */
        submitConversion: async (e) => {
            e.preventDefault();
            const modal = Utils.$(CONFIG.DOM.MODALS.CONVERT);
            const dom = CONFIG.DOM.CONVERT_FORM;
            
            const targetsStr = Utils.$(dom.TARGETS).value;
            const targets = JSON.parse(targetsStr || '[]');
            
            if (targets.length === 0) return;

            // Get Format
            const selectedRadio = document.querySelector('input[name="formatRadio"]:checked');
            const format = selectedRadio ? selectedRadio.value : 'mp4';

            const payload = {
                files: targetsStr, // Backend expects JSON string
                format: format,
                resolution: Utils.$(dom.RESOLUTION).value,
                crf: Utils.$(dom.CRF).value,
                bitrate: Utils.$(dom.BITRATE_V).value,
                audioBitrate: Utils.$(dom.BITRATE_A).value,
                advanced: Utils.$(dom.ADVANCED).value
            };

            // Use FormData to match backend expectation
            const formData = new FormData();
            Object.entries(payload).forEach(([k, v]) => formData.append(k, v));

            try {
                await API.startConversion(formData);
                Toaster.show(`Rozpoczęto konwersję ${targets.length} plików!`, 'success');
                
                // Clear selection
                targets.forEach(t => state.selection.uploads.delete(t));
                HeaderManager.update();
                
                modal.classList.remove('show');
            } catch (err) {
                Toaster.show(err.message, 'error');
            }
        },

        /**
         * Settings Save
         */
        saveSettings: () => {
            const dom = CONFIG.DOM.SETTINGS;
            
            state.settings = {
                defaultFormat: Utils.$(dom.FORMAT).value,
                defaultCrf: parseInt(Utils.$(dom.CRF).value, 10),
                sortBy: Utils.$(dom.SORT).value,
                theme: 'cyber'
            };
            
            Persistence.save();
            Toaster.show('Ustawienia zapisane', 'success');
            
            // Apply Sort
            ListRenderer.renderAll();
        }
    };

    // ==========================================================================
    // 12. SSE (REAL-TIME EVENTS)
    // ==========================================================================

    const SSE = {
        init: () => {
            console.log("[SSE] Initializing connection...");
            const source = new EventSource(CONFIG.ENDPOINTS.SSE);

            source.addEventListener('start', (e) => {
                const data = JSON.parse(e.data);
                state.activeConversions[data.fileName] = { percent: 0, status: 'starting' };
                ListRenderer.updateProgress(data.fileName, 0);
            });

            source.addEventListener('progress', (e) => {
                const data = JSON.parse(e.data);
                state.activeConversions[data.fileName] = { percent: data.percent, status: 'processing' };
                ListRenderer.updateProgress(data.fileName, data.percent);
            });

            source.addEventListener('complete', (e) => {
                const data = JSON.parse(e.data);
                
                // Cleanup Active Process
                delete state.activeConversions[data.fileName];
                ListRenderer.updateProgress(data.fileName, null); 
                
                Toaster.show(`Zakończono: ${data.outputFile}`, 'success');
                
                // Optimistic UI update: Add to converted list immediately if we had the full object
                // Since we don't have full metadata here, trigger refresh.
                Logic.refreshLists(false);
            });

            source.addEventListener('error', (e) => {
                // If data exists, it's a processing error
                if (e.data) {
                    const data = JSON.parse(e.data);
                    delete state.activeConversions[data.fileName];
                    ListRenderer.updateProgress(data.fileName, null);
                    Toaster.show(`Błąd konwersji: ${data.fileName}`, 'error');
                }
                // If no data, it's likely a network error / reconnect
                // Browser handles reconnect automatically.
            });
            
            source.onopen = () => console.log("[SSE] Connected");
        }
    };

    // ==========================================================================
    // 13. INITIALIZATION & BINDING
    // ==========================================================================

    const Init = () => {
        console.log("MediaFlow v5.1 Booting...");
        
        // 1. Load Settings
        Persistence.load();
        
        // 2. Global Event Bindings (Exposing functions to window for HTML onclicks)
        window.openTab = (e, id) => { if(e) e.preventDefault(); Logic.openTab(id); };
        window.refreshLists = () => Logic.refreshLists(true);
        window.clearPendingQueue = Logic.clearPending;
        
        // Batch Actions
        window.globalSelectAll = Logic.toggleSelectAll;
        window.globalBatchDelete = Logic.batchDelete;
        window.batchConvert = Logic.batchConvert;
        window.batchDownload = Logic.batchDownload;
        
        // Modal Actions
        window.saveSettings = Logic.saveSettings;
        
        // Expose Logic for generated HTML
        window.Logic = Logic;
        window.Modals = Modals;
        window.API = API;

        // 3. DOM Event Listeners
        
        // Sidebar Toggle
        const sbToggle = Utils.$(CONFIG.DOM.SIDEBAR_TOGGLE);
        if (sbToggle) {
            sbToggle.addEventListener('click', () => {
                state.sidebarCollapsed = !state.sidebarCollapsed;
                Utils.$(CONFIG.DOM.APP_LAYOUT).classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
                Utils.$(CONFIG.DOM.SIDEBAR).classList.toggle('collapsed', state.sidebarCollapsed);
            });
        }
        // Apply initial sidebar state
        if (state.sidebarCollapsed) {
            Utils.$(CONFIG.DOM.APP_LAYOUT).classList.add('sidebar-collapsed');
            Utils.$(CONFIG.DOM.SIDEBAR).classList.add('collapsed');
        }

        // Search Input (Debounced)
        const searchInput = Utils.$(CONFIG.DOM.HEADER.SEARCH_INPUT);
        const searchClear = Utils.$(CONFIG.DOM.HEADER.SEARCH_CLEAR);
        if (searchInput) {
            const handleSearch = Utils.debounce((e) => {
                state.searchQuery = e.target.value.trim();
                
                // Show/Hide Clear Button
                if (searchClear) searchClear.style.display = state.searchQuery ? 'block' : 'none';
                
                // Re-render current list
                if (state.currentTab !== 'settings' && state.currentTab !== 'pending') {
                    ListRenderer.render(state.currentTab);
                    HeaderManager.updateSelectAllBtn(state.currentTab);
                }
            }, CONFIG.TIMING.DEBOUNCE_DELAY);

            searchInput.addEventListener('input', handleSearch);
        }

        window.clearSearch = () => {
            state.searchQuery = '';
            if (searchInput) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            }
        };

        // File Input & Drag/Drop
        const fileInput = Utils.$(CONFIG.DOM.UPLOAD.INPUT);
        const selectBtn = Utils.$(CONFIG.DOM.UPLOAD.SELECT_BTN);
        const dropZone = Utils.$(CONFIG.DOM.UPLOAD.DROP_OVERLAY);
        const startUpBtn = Utils.$(CONFIG.DOM.UPLOAD.START_BTN);

        if (selectBtn && fileInput) {
            selectBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => Logic.addPendingFiles(e.target.files));
        }

        if (startUpBtn) {
            startUpBtn.addEventListener('click', Logic.startUpload);
        }

        // Global Drag & Drop
        window.addEventListener('dragenter', (e) => {
            if (e.dataTransfer.types && e.dataTransfer.types.indexOf('Files') !== -1) {
                dropZone.classList.add('show');
            }
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            if (e.target === dropZone) dropZone.classList.remove('show');
        });
        
        window.addEventListener('dragover', e => e.preventDefault());
        
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('show');
            if (e.dataTransfer.files.length > 0) {
                Logic.addPendingFiles(e.dataTransfer.files);
            }
        });

        // Form Submit
        const convForm = Utils.$(CONFIG.DOM.CONVERT_FORM.FORM);
        if (convForm) convForm.addEventListener('submit', Logic.submitConversion);

        // Modal Closers
        Utils.qsa('.close-btn, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent form submits if button is inside form
                Modals.closeAll();
            });
        });

        // Close modal on outside click
        window.onclick = (e) => {
            if (e.target.classList.contains('modal')) {
                Modals.closeAll();
            }
        };

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') Modals.closeAll();
            // Delete key for batch delete in valid tabs
            if (e.key === 'Delete' && (state.currentTab === 'uploads' || state.currentTab === 'converted')) {
                // Ensure we aren't typing in search
                if (document.activeElement !== searchInput) {
                    Logic.batchDelete();
                }
            }
        });

        // 4. Start Services
        SSE.init();
        Logic.openTab(state.currentTab || 'pending');
        
        // Initial Fetch
        Logic.refreshLists(true);
        
        // Background Refresh Interval
        setInterval(() => Logic.refreshLists(false), CONFIG.TIMING.REFRESH_INTERVAL);
    };

    // DOM Ready Bootstrap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', Init);
    } else {
        Init();
    }

})();
