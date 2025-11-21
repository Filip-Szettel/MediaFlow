// main.js - Naprawiona wersja z poprawkami błędów, toggle select all/deselect all,
// trigger file input, brak alertu na starcie, podstawowe settings.

(() => {
    'use strict';

    // ==================== UTILS ====================
    const {
        pipe,
        curry,
        tap,
        always,
        compose,
        prop,
        assoc,
        dissoc,
        filter,
        map,
        reduce,
        find,
        isEmpty,
        propEq,
        reject,
        sortBy,
        values,
        keys,
        identity,
    } = (() => {
        const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);
        const curry = (fn) => {
            return function curried(...args) {
                if (args.length >= fn.length) return fn.apply(this, args);
                return (...nextArgs) => curried.apply(this, [...args, ...nextArgs]);
            };
        };
        const tap = (fn) => (x) => { fn(x); return x; };
        const always = (val) => () => val;
        const compose = (...fns) => pipe(...fns.reverse());
        const prop = curry((key, obj) => obj?.[key]);
        const assoc = curry((key, val, obj) => ({ ...obj, [key]: val }));
        const dissoc = curry((key, obj) => {
            const { [key]: _, ...rest } = obj;
            return rest;
        });
        const filter = curry((pred, xs) => xs.filter(pred));
        const map = curry((fn, xs) => xs.map(fn));
        const reduce = curry((fn, init, xs) => xs.reduce(fn, init));
        const find = curry((pred, xs) => xs.find(pred));
        const isEmpty = (xs) => xs.length === 0;
        const propEq = curry((key, val, obj) => obj?.[key] === val);
        const reject = curry((pred, xs) => xs.filter((x) => !pred(x)));
        const sortBy = curry((fn, xs) => [...xs].sort((a, b) => fn(a) - fn(b) || fn(b) - fn(a)));
        const values = (obj) => Object.values(obj);
        const keys = (obj) => Object.keys(obj);
        const identity = (x) => x;

        return {
            pipe, curry, tap, always, compose, prop, assoc, dissoc,
            filter, map, reduce, find, isEmpty, propEq, reject, sortBy, values, keys, identity,
        };
    })();

    // ==================== CONSTANTS ====================
    const SUPPORTED_EXTENSIONS = new Set([
        'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ogv', 'm4v',
        'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma',
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'
    ]);
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    const STORAGE_KEY = 'mediaFlowState';

    // ==================== STATE MANAGEMENT ====================
    const loadState = () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return initialState;
            const parsed = JSON.parse(saved);
            return {
                ...initialState,
                ...parsed,
                selectedUploads: new Set(parsed.selectedUploads || []),
                selectedConverted: new Set(parsed.selectedConverted || []),
                fileUrls: new Map(parsed.fileUrls || []),
                selectedFiles: parsed.selectedFiles || [],
            };
        } catch {
            return initialState;
        }
    };
    const saveState = (state) => {
        try {
            const serializable = {
                ...state,
                selectedFiles: state.selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
                fileUrls: Array.from(state.fileUrls.entries()).map(([k, v]) => [k ? k.name : k, v]),
                selectedUploads: Array.from(state.selectedUploads),
                selectedConverted: Array.from(state.selectedConverted),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
        } catch {}
    };

    const initialState = {
        selectedFiles: [],
        fileUrls: new Map(),
        selectedUploads: new Set(),
        selectedConverted: new Set(),
        currentTab: 'pending',
        sidebarCollapsed: false,
        settings: { defaultFormat: 'mp4', defaultCrf: 23, sortBy: 'name' },
        searchQuery: '',
        dragCounter: 0,
        uploads: [],
        converted: [],
        currentFileToConvert: null,
    };

    const stateReducer = (state, action) => {
        switch (action.type) {
            case 'ADD_FILES':
                return assoc('selectedFiles', [...new Set([...state.selectedFiles, ...action.files])], state);
            case 'REMOVE_FILE':
                const fileToRemove = find(propEq('name', action.fileName), state.selectedFiles);
                if (fileToRemove) {
                    const url = state.fileUrls.get(fileToRemove);
                    if (url) URL.revokeObjectURL(url);
                    state.fileUrls.delete(fileToRemove);
                }
                return assoc('selectedFiles', reject(propEq('name', action.fileName), state.selectedFiles), state);
            case 'TOGGLE_SELECT_UPLOAD':
                const newUploads = action.selected 
                    ? new Set([...state.selectedUploads, action.fileName]) 
                    : new Set(reject(x => x === action.fileName, state.selectedUploads));
                return assoc('selectedUploads', newUploads, state);
            case 'TOGGLE_SELECT_CONVERTED':
                const newConverted = action.selected 
                    ? new Set([...state.selectedConverted, action.fileName]) 
                    : new Set(reject(x => x === action.fileName, state.selectedConverted));
                return assoc('selectedConverted', newConverted, state);
            case 'SET_TAB':
                return assoc('currentTab', action.tab, state);
            case 'TOGGLE_SIDEBAR':
                return assoc('sidebarCollapsed', !state.sidebarCollapsed, state);
            case 'SET_SEARCH':
                return assoc('searchQuery', action.query, state);
            case 'UPDATE_SETTINGS':
                return assoc('settings', { ...state.settings, ...action.updates }, state);
            case 'LOAD_FILES':
                return assoc('uploads', action.uploads || [], assoc('converted', action.converted || [], state));
            case 'SET_CURRENT_CONVERT':
                return assoc('currentFileToConvert', action.files || action.file, state);
            case 'CLEAR_PENDING':
                state.fileUrls.forEach(URL.revokeObjectURL);
                return assoc('selectedFiles', [], assoc('fileUrls', new Map(), state));
            case 'CLEAR_SELECTED_UPLOADS':
                return assoc('selectedUploads', new Set(), state);
            case 'CLEAR_SELECTED_CONVERTED':
                return assoc('selectedConverted', new Set(), state);
            case 'CLEAR_URLS':
                return assoc('fileUrls', new Map(), state);
            case 'INCREMENT_DRAG':
                return assoc('dragCounter', state.dragCounter + 1, state);
            case 'DECREMENT_DRAG':
                return assoc('dragCounter', Math.max(0, state.dragCounter - 1), state);
            default:
                return state;
        }
    };

    let currentState = loadState();
    const subscribers = new Set();
    const getState = () => ({ ...currentState });
    const dispatch = (action) => {
        currentState = stateReducer(currentState, action);
        saveState(currentState);
        subscribers.forEach(cb => cb(currentState));
    };
    const subscribe = (cb) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
    };

    // ==================== API FUNCTIONS ====================
    const api = {
        uploadFiles: async (files) => {
            const formData = new FormData();
            files.forEach(f => formData.append('files', f));
            const res = await fetch('/upload', { method: 'POST', body: formData });
            if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
            return await res.json();
        },
        convertFiles: async (files, options) => {
            const formData = new FormData();
            formData.append('files', JSON.stringify(files));
            Object.entries(options).forEach(([k, v]) => formData.append(k, v));
            const res = await fetch('/convert', { method: 'POST', body: formData });
            if (!res.ok) throw new Error((await res.json()).error || 'Convert failed');
            return await res.json();
        },
        loadFiles: async () => {
            const res = await fetch('/files');
            if (!res.ok) throw new Error('Load failed');
            return await res.json();
        },
        deleteFile: async (fileName, dir) => {
            const res = await fetch(`/delete/${encodeURIComponent(fileName)}/${dir}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
        },
        downloadFile: (fileName) => {
            const link = document.createElement('a');
            link.href = `/download/${encodeURIComponent(fileName)}`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },
    };

    // ==================== UI FUNCTIONS ====================
    const dom = {
        getElement: (sel) => document.querySelector(sel),
        getElements: (sel) => document.querySelectorAll(sel),
        createElement: (tag, props = {}, children = []) => {
            const el = document.createElement(tag);
            Object.entries(props).forEach(([k, v]) => {
                if (k === 'textContent') el.textContent = v;
                else if (k === 'innerHTML') el.innerHTML = v;
                else el[k] = v;
            });
            children.forEach(child => el.append(typeof child === 'string' ? document.createTextNode(child) : child));
            return el;
        },
    };

    const isSupportedFile = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        return SUPPORTED_EXTENSIONS.has(ext) && file.size <= MAX_FILE_SIZE;
    };

    const handleFileAdd = (files) => {
        const validFiles = files.filter(isSupportedFile);
        const invalidNames = files.filter(f => !isSupportedFile(f)).map(f => f.name);
        if (invalidNames.length > 0) {
            showToast(`Pominięto: ${invalidNames.join(', ')} (nieobsługiwane lub za duże).`, 'error');
        }
        if (validFiles.length > 0) {
            dispatch({ type: 'ADD_FILES', files: validFiles });
            renderPendingList();
            showToast(`${validFiles.length} plików dodanych do kolejki.`);
            updateUploadButton();
        }
    };

    const createThumbnail = (file) => {
        const ext = file.name.split('.').pop().toLowerCase();
        const thumbDiv = dom.createElement('div', { className: 'file-thumbnail' });
        const iconEl = dom.createElement('i', { className: getFileIcon(ext), style: 'font-size: 3rem; opacity: 0.8; color: white; display: none;' });
        thumbDiv.append(iconEl);

        const url = URL.createObjectURL(file);
        currentState.fileUrls.set(file, url); // Direct set for simplicity

        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
            const img = dom.createElement('img', { 
                src: url,
                style: 'width:100%;height:100%;object-fit:cover;position:absolute;',
                onerror: () => { img.style.display = 'none'; iconEl.style.display = 'flex'; }
            });
            thumbDiv.append(img);
        } else if (['mp4', 'webm', 'ogv'].includes(ext)) {
            const vid = dom.createElement('video', {
                src: url,
                muted: true, loop: true, autoplay: true,
                style: 'width:100%;height:100%;object-fit:cover;position:absolute;',
                onerror: () => { vid.style.display = 'none'; iconEl.style.display = 'flex'; }
            });
            thumbDiv.append(vid);
        } else {
            iconEl.style.display = 'flex';
        }
        return thumbDiv;
    };

    const getFileIcon = (ext) => {
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'fas fa-image';
        if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ogv', 'm4v'].includes(ext)) return 'fas fa-video';
        if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma'].includes(ext)) return 'fas fa-music';
        return 'fas fa-file';
    };

    const createServerThumbnail = (fileName, isUpload) => {
        const ext = fileName.split('.').pop().toLowerCase();
        const baseUrl = isUpload ? '/thumbnail/' : '/preview/';
        const iconClass = getFileIcon(ext);
        let thumbnailHTML = `<i class="${iconClass}" style="font-size: 3rem; opacity: 0.8; color: white; display: none;"></i>`;

        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
            thumbnailHTML = `<img src="${baseUrl}${encodeURIComponent(fileName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" style="width:100%;height:100%;object-fit:cover;position:absolute;">${thumbnailHTML}`;
        } else if (['mp4', 'webm', 'ogv'].includes(ext)) {
            thumbnailHTML = `<video src="${baseUrl}${encodeURIComponent(fileName)}" muted loop autoplay onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" style="width:100%;height:100%;object-fit:cover;position:absolute;"></video>${thumbnailHTML}`;
        } else {
            thumbnailHTML = `<i class="${iconClass}" style="font-size: 3rem; opacity: 0.8; color: white; display: flex;"></i>`;
        }
        return dom.createElement('div', { className: 'file-thumbnail', innerHTML: thumbnailHTML });
    };

    const renderFileCard = (file, index, isPending = true, isUpload = false) => {
        const card = dom.createElement('div', { className: 'file-card', 'data-filename': file.name || file });
        const thumb = isPending ? createThumbnail(file) : createServerThumbnail(file.name || file, isUpload);
        const checkbox = dom.createElement('input', { type: 'checkbox', className: 'file-checkbox' });
        checkbox.addEventListener('change', (e) => toggleFileSelect(card, e.target.checked, isUpload ? 'uploads' : 'converted'));

        card.addEventListener('click', (e) => {
            if (['BUTTON', 'I', 'INPUT'].includes(e.target.tagName)) return;
            checkbox.checked = !checkbox.checked;
            toggleFileSelect(card, checkbox.checked, isUpload ? 'uploads' : 'converted');
        });

        const size = isPending ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : (isUpload ? 'Gotowy do konwersji' : `Skonwertowany ${new Date().toLocaleDateString('pl-PL')}`);
        const typeOrTime = isPending ? (file.type || 'Nieznany typ') : `<i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}`;

        const actions = isPending 
            ? [dom.createElement('button', { 
                className: 'file-action-btn file-action-danger', 
                onclick: (e) => { e.stopPropagation(); removePendingFile(index); },
                innerHTML: '<i class="fas fa-trash"></i> Usuń'
              })] 
            : [
                dom.createElement('button', { 
                    className: `file-action-btn ${isUpload ? 'file-action-primary' : 'file-action-download'}`, 
                    onclick: (e) => { e.stopPropagation(); (isUpload ? openConvertModal : api.downloadFile)(file.name || file); },
                    innerHTML: `<i class="fas fa-${isUpload ? 'magic' : 'download'}"></i> ${isUpload ? 'Konwertuj' : 'Pobierz'}`
                }),
                dom.createElement('button', { 
                    className: 'file-action-btn file-action-danger', 
                    onclick: (e) => { e.stopPropagation(); removeFileSingle(file.name || file, isUpload ? 'uploads' : 'converted'); },
                    innerHTML: '<i class="fas fa-trash"></i> Usuń'
                }),
              ];

        card.append(
            checkbox,
            thumb,
            dom.createElement('div', { className: 'file-info' }, [
                dom.createElement('div', { className: 'file-name', textContent: file.name || file }),
                dom.createElement('div', { className: 'file-meta' }, [
                    dom.createElement('span', { textContent: size }),
                    dom.createElement('span', { innerHTML: typeOrTime }),
                ]),
                isPending ? dom.createElement('div', { className: 'file-progress' }, [dom.createElement('div', { className: 'file-progress-fill' })]) : null,
                dom.createElement('div', { className: 'file-actions' }, actions),
            ])
        );
        return card;
    };

    const renderList = (containerId, files, isPending = false, isUpload = false) => {
        const container = dom.getElement(`#${containerId}`);
        if (!container) return;
        const emptyEl = dom.getElement(`#${containerId.replace('List', 'Empty')}`);
        container.innerHTML = '';

        if (isEmpty(files)) {
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        const { searchQuery, settings: { sortBy } } = getState();
        const filteredAndSorted = pipe(
            filter(f => (f.name || f).toLowerCase().includes(searchQuery.toLowerCase())),
            withSort(sortBy),
        )(files);

        filteredAndSorted.forEach((file, idx) => container.append(isPending ? renderFileCard(file, idx, true) : renderFileCard(file, 0, false, isUpload)));
        if (!isPending) updateBatchButtons(isUpload ? 'uploads' : 'converted');
    };

    const updateUploadButton = () => {
        const { selectedFiles } = getState();
        const uploadBtn = dom.getElement('#uploadBtn');
        if (uploadBtn) {
            if (selectedFiles.length > 0) {
                uploadBtn.innerHTML = `<i class="fas fa-upload"></i> Uploaduj (${selectedFiles.length} plików)`;
                uploadBtn.classList.add('btn-primary');
                uploadBtn.classList.remove('upload-btn');
            } else {
                uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Wybierz pliki';
                uploadBtn.classList.remove('btn-primary');
                uploadBtn.classList.add('upload-btn');
            }
        }
    };

    const handleUpload = async () => {
        const { selectedFiles } = getState();
        if (isEmpty(selectedFiles)) return;

        const uploadProgress = dom.getElement('#uploadProgressFill');
        if (uploadProgress) uploadProgress.parentElement.parentElement.style.display = 'block';

        try {
            await withProgress(uploadProgress, async () => {
                await api.uploadFiles(selectedFiles);
                dispatch({ type: 'CLEAR_PENDING' });
                await loadAndRenderLists();
            });
            showToast('Upload zakończony pomyślnie!');
        } catch (err) {
            showToast(`Błąd uploadu: ${err.message}`, 'error');
        } finally {
            setTimeout(() => {
                if (uploadProgress) uploadProgress.parentElement.parentElement.style.display = 'none';
                updateUploadButton();
            }, 1500);
        }
    };

    const handleConvert = async (form) => {
        const { currentFileToConvert } = getState();
        if (!currentFileToConvert) return;

        const options = {
            format: form.format.value,
            resolution: form.resolution.value,
            crf: form.crf.value,
            bitrate: form.bitrate.value,
            audioBitrate: form.audioBitrate.value,
            advanced: form.advanced.value,
        };

        const validators = [
            [options.crf, (v) => v >= 18 && v <= 28, 'CRF musi być między 18 a 28.'],
            [options.format, (v) => ['mp4', 'webm', 'avi', 'mp3', 'wav', 'gif'].includes(v), 'Nieprawidłowy format.'],
        ];
        const error = validators.find(([v, pred]) => v && !pred(v))?.[2];
        if (error) {
            showToast(error, 'error');
            return;
        }

        const files = Array.isArray(currentFileToConvert) ? currentFileToConvert : [currentFileToConvert];

        const convertProgress = dom.getElement('#convertProgressFill');
        if (convertProgress) convertProgress.parentElement.parentElement.style.display = 'block';

        const submitBtn = form.querySelector('.convert-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Konwertowanie...';

        try {
            await withProgress(convertProgress, async () => {
                await api.convertFiles(files, options);
                await loadAndRenderLists();
                if (Array.isArray(currentFileToConvert)) dispatch({ type: 'CLEAR_SELECTED_UPLOADS' });
            });
            showToast(`Konwersja zakończona: ${files.length} plików gotowych`);
            dom.getElement('#convertModal').classList.remove('show');
            dispatch({ type: 'UPDATE_SETTINGS', updates: { defaultFormat: options.format, defaultCrf: options.crf } }); // Save defaults
        } catch (err) {
            showToast(`Błąd konwersji: ${err.message}`, 'error');
        } finally {
            setTimeout(() => {
                if (convertProgress) convertProgress.parentElement.parentElement.style.display = 'none';
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }, 1500);
        }
    };

    const withProgress = (progressEl, fn) => {
        if (!progressEl) return fn();
        const originalWidth = progressEl.style.width;
        progressEl.style.width = '0%';
        return fn().finally(() => {
            progressEl.style.width = '100%';
            setTimeout(() => progressEl.style.width = originalWidth || '0%', 1500);
        });
    };

    const batchDelete = async (section) => {
        const selected = section === 'uploads' ? getState().selectedUploads : getState().selectedConverted;
        if (isEmpty(selected)) return;
        if (!confirm(`Czy na pewno usunąć ${selected.size} plików?`)) return;

        try {
            await Promise.all(Array.from(selected).map(f => api.deleteFile(f, section)));
            await loadAndRenderLists();
            dispatch(section === 'uploads' ? { type: 'CLEAR_SELECTED_UPLOADS' } : { type: 'CLEAR_SELECTED_CONVERTED' });
            showToast(`${selected.size} plików usuniętych.`);
        } catch (err) {
            showToast('Błąd usuwania.', 'error');
        }
    };

    const batchDownload = async () => {
        const selected = getState().selectedConverted;
        if (isEmpty(selected)) return;
        Array.from(selected).forEach(api.downloadFile);
        showToast(`${selected.size} plików pobranych.`);
    };

    const batchConvert = () => {
        const selected = Array.from(getState().selectedUploads);
        if (isEmpty(selected)) return;
        dispatch({ type: 'SET_CURRENT_CONVERT', files: selected });
        dom.getElement('#convertModal').classList.add('show');
        const { settings } = getState();
        dom.getElement('#format').value = settings.defaultFormat;
        dom.getElement('#crf').value = settings.defaultCrf;
    };

    const debounce = (fn, ms) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    };
    const handleSearch = debounce((query) => {
        dispatch({ type: 'SET_SEARCH', query });
        const { currentTab } = getState();
        if (currentTab === 'pending') renderPendingList();
        else if (currentTab === 'uploads') renderUploadsList();
        else if (currentTab === 'converted') renderConvertedList();
    }, 300);

    const withSort = curry((sortKey, files) => {
        const sorters = {
            name: sortBy(f => (f.name || f).toLowerCase()),
            size: sortBy(f => f.size || 0),
            date: sortBy(f => new Date(f.lastModified || 0).getTime()),
        };
        return sorters[sortKey] ? sorters[sortKey](files) : files;
    });

    const renderPendingList = () => renderList('pendingList', getState().selectedFiles, true);
    const renderUploadsList = () => renderList('uploadsList', getState().uploads, false, true);
    const renderConvertedList = () => renderList('convertedList', getState().converted, false, false);

    const loadAndRenderLists = async () => {
        try {
            const { uploads, converted } = await api.loadFiles();
            dispatch({ type: 'LOAD_FILES', uploads, converted });
            const { currentTab } = getState();
            if (currentTab === 'uploads') renderUploadsList();
            if (currentTab === 'converted') renderConvertedList();
            updateCounts();
        } catch (err) {
            showToast('Błąd ładowania list.', 'error');
        }
    };

    const updateCounts = () => {
        dom.getElement('#pendingCount').textContent = `${getState().selectedFiles.length} plików`;
        dom.getElement('#uploadsCount').textContent = `${getState().uploads.length} plików`;
        dom.getElement('#convertedCount').textContent = `${getState().converted.length} plików`;
    };

    const updateBatchButtons = (section) => {
        const count = section === 'uploads' ? getState().selectedUploads.size : getState().selectedConverted.size;
        const batchBtns = dom.getElements(`.${section}Tab .batch-actions .btn`);
        batchBtns.forEach(btn => {
            if (btn.classList.contains('batch-convert') || btn.classList.contains('batch-download') || btn.classList.contains('batch-delete')) {
                btn.style.display = count > 0 ? 'inline-flex' : 'none';
            }
        });
    };

    const updateSelectAllButtons = (section) => {
        const btn = dom.getElement(`.${section}Tab .btn[onclick="selectAll('${section}')"]`);
        if (!btn) return;
        const total = dom.getElements(`#${section}List .file-card`).length;
        const selected = section === 'uploads' ? getState().selectedUploads.size : getState().selectedConverted.size;
        if (selected === total && total > 0) {
            btn.innerHTML = '<i class="fas fa-square"></i> Odznacz wszystkie';
        } else {
            btn.innerHTML = '<i class="fas fa-check-square"></i> Zaznacz wszystkie';
        }
    };

    const toggleSelectAll = (section) => {
        const cards = dom.getElements(`#${section}List .file-card`);
        const total = cards.length;
        if (total === 0) return;
        const currentlySelected = section === 'uploads' ? getState().selectedUploads.size : getState().selectedConverted.size;
        const shouldSelect = currentlySelected < total;
        cards.forEach(card => {
            const cb = card.querySelector('input[type="checkbox"]');
            if (cb.checked !== shouldSelect) {
                cb.checked = shouldSelect;
                toggleFileSelect(card, shouldSelect, section);
            }
        });
        updateSelectAllButtons(section);
        showToast(`${shouldSelect ? 'Zaznaczono' : 'Odznaczono'} wszystkie pliki.`);
    };

    const revokeAllUrls = () => {
        getState().fileUrls.forEach(URL.revokeObjectURL);
        dispatch({ type: 'CLEAR_URLS' });
    };

    const bindEvents = () => {
        // Sidebar toggle - fix: only toggle classes correctly
        const sidebarToggle = dom.getElement('#sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                dispatch({ type: 'TOGGLE_SIDEBAR' });
            });
        }

        // Tab switch
        dom.getElements('.tablinks').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const onclick = btn.getAttribute('onclick');
                const tabMatch = onclick ? onclick.match(/openTab\(event, '([^']+)'\)/) : null;
                const tabName = tabMatch ? tabMatch[1] : 'pending';
                openTab(e, tabName);
            });
        });

        // File input - change adds files
        const fileInput = dom.getElement('#fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                handleFileAdd(Array.from(e.target.files));
                fileInput.value = '';
            });
        }

        // Upload button - first click to select, then upload
        const uploadBtn = dom.getElement('#uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                const { selectedFiles } = getState();
                if (selectedFiles.length === 0) {
                    fileInput.click(); // Open file dialog if no files
                } else {
                    handleUpload(); // Upload if files present
                }
            });
        }

        // Drag-drop
        const preventDefaults = (e) => e.preventDefault();
        const handleDragEnter = (e) => {
            dispatch({ type: 'INCREMENT_DRAG' });
            const { dragCounter } = getState();
            dom.getElement('#dropZone')?.classList.toggle('show', dragCounter > 0);
        };
        const handleDragLeave = (e) => {
            dispatch({ type: 'DECREMENT_DRAG' });
            const { dragCounter } = getState();
            dom.getElement('#dropZone')?.classList.toggle('show', dragCounter > 0);
        };
        const handleDrop = (e) => {
            preventDefaults(e);
            handleDragLeave(e);
            handleFileAdd(Array.from(e.dataTransfer.files));
        };
        const dragElements = [document, document.body, dom.getElement('#uploadZone')].filter(Boolean);
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
            dragElements.forEach(el => {
                el.addEventListener(ev, preventDefaults, false);
                if (ev === 'dragenter') el.addEventListener(ev, handleDragEnter, false);
                if (ev === 'dragleave') el.addEventListener(ev, handleDragLeave, false);
                if (ev === 'drop') el.addEventListener(ev, handleDrop, false);
            });
        });

        // Search
        const globalSearch = dom.getElement('#globalSearch');
        if (globalSearch) globalSearch.addEventListener('input', (e) => handleSearch(e.target.value));

        // Modal
        const convertForm = dom.getElement('#convertForm');
        if (convertForm) {
            convertForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleConvert(convertForm);
            });
        }
        const closeModal = dom.getElement('.close');
        if (closeModal) closeModal.addEventListener('click', () => dom.getElement('#convertModal')?.classList.remove('show'));
        window.addEventListener('click', (e) => {
            if (e.target.id === 'convertModal') dom.getElement('#convertModal')?.classList.remove('show');
        });

        // Refresh
        const refreshBtn = dom.getElement('button[onclick="refreshLists()"]');
        if (refreshBtn) refreshBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); loadAndRenderLists(); });

        // Batch
        dom.getElements('.batch-delete').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const tab = btn.closest('.tabcontent').id; batchDelete(tab); }));
        dom.getElements('.batch-convert').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); batchConvert(); }));
        dom.getElements('.batch-download').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); batchDownload(); }));

        // Select all - override onclick
        dom.getElements('.btn[onclick*="selectAll"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const onclick = btn.getAttribute('onclick');
                const sectionMatch = onclick.match(/selectAll\('([^']+)'\)/);
                const section = sectionMatch ? sectionMatch[1] : '';
                if (section) toggleSelectAll(section);
            });
        });

        // Settings - basic form
        const settingsTab = dom.getElement('#settings');
        if (settingsTab) {
            const glassDiv = settingsTab.querySelector('.glass');
            if (glassDiv) {
                glassDiv.innerHTML = `
                    <form id="settingsForm">
                        <div class="form-group">
                            <label for="defaultFormat">Domyślny format</label>
                            <select id="defaultFormat">
                                <option value="mp4">MP4</option>
                                <option value="webm">WebM</option>
                                <option value="avi">AVI</option>
                                <option value="mp3">MP3</option>
                                <option value="wav">WAV</option>
                                <option value="gif">GIF</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="defaultCrf">Domyślny CRF</label>
                            <input type="number" id="defaultCrf" min="18" max="28" value="23">
                        </div>
                        <div class="form-group">
                            <label for="sortBy">Sortuj według</label>
                            <select id="sortBy">
                                <option value="name">Nazwa</option>
                                <option value="size">Rozmiar</option>
                                <option value="date">Data</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">Zapisz ustawienia</button>
                    </form>
                `;
                const settingsForm = glassDiv.querySelector('#settingsForm');
                settingsForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const formData = new FormData(settingsForm);
                    const updates = Object.fromEntries(formData);
                    dispatch({ type: 'UPDATE_SETTINGS', updates });
                    showToast('Ustawienia zapisane!');
                });
                // Load current settings
                const { settings } = getState();
                dom.getElement('#defaultFormat').value = settings.defaultFormat;
                dom.getElement('#defaultCrf').value = settings.defaultCrf;
                dom.getElement('#sortBy').value = settings.sortBy;
            }
        }

        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '/') dom.getElement('#globalSearch')?.focus();
            if (e.key === 'Escape') dom.getElement('#convertModal')?.classList.remove('show');
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                const tab = getState().currentTab;
                if (['uploads', 'converted'].includes(tab)) toggleSelectAll(tab);
            }
        });
    };

    const openTab = (evt, tabName) => {
        dom.getElements('.tabcontent').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
        dom.getElements('.tablinks').forEach(l => l.classList.remove('active'));
        const tabEl = dom.getElement(`#${tabName}`);
        if (tabEl) {
            tabEl.style.display = 'block';
            tabEl.classList.add('active');
        }
        evt.currentTarget.classList.add('active');

        dispatch({ type: 'SET_TAB', tab: tabName });
        const iconMatch = evt.currentTarget.querySelector('i')?.className.match(/fa-(\w+)/);
        const icon = iconMatch ? iconMatch[1] : 'home';
        const titleSpan = evt.currentTarget.querySelector('span')?.textContent || tabName;
        const currentTitle = dom.getElement('#currentTitle');
        if (currentTitle) currentTitle.innerHTML = `<i class="fas fa-${icon}"></i> ${titleSpan}`;

        const globalSearch = dom.getElement('#globalSearch');
        if (globalSearch) {
            globalSearch.value = '';
            dispatch({ type: 'SET_SEARCH', query: '' });
        }
        if (tabName === 'pending') renderPendingList();
        else if (tabName === 'uploads') {
            renderUploadsList();
            updateSelectAllButtons('uploads');
        }
        else if (tabName === 'converted') {
            renderConvertedList();
            updateSelectAllButtons('converted');
        }

        const tabContainer = dom.getElement('.tab-content-container');
        if (tabContainer) tabContainer.scrollTop = 0;
    };

    const showToast = (msg, type = 'success') => {
        const toast = dom.getElement('#toast');
        if (toast) {
            toast.textContent = msg;
            toast.className = `toast ${type} show`;
            setTimeout(() => toast.classList.remove('show'), 4000);
        }
    };

    const removePendingFile = (index) => {
        const { selectedFiles } = getState();
        dispatch({ type: 'REMOVE_FILE', fileName: selectedFiles[index]?.name });
        renderPendingList();
        updateUploadButton();
        if (selectedFiles.length === 1) {
            const uploadProgress = dom.getElement('.upload-progress');
            if (uploadProgress) uploadProgress.style.display = 'none';
        }
        showToast('Plik usunięty z kolejki.');
    };

    const toggleFileSelect = (card, checked, section) => {
        const fileName = card.dataset.filename;
        if (section === 'uploads') {
            dispatch({ type: 'TOGGLE_SELECT_UPLOAD', fileName, selected: checked });
        } else {
            dispatch({ type: 'TOGGLE_SELECT_CONVERTED', fileName, selected: checked });
        }
        updateBatchButtons(section);
        updateSelectAllButtons(section);
    };

    const openConvertModal = (fileName) => {
        dispatch({ type: 'SET_CURRENT_CONVERT', file: fileName });
        dom.getElement('#convertModal')?.classList.add('show');
        const submitBtn = dom.getElement('.convert-submit');
        if (submitBtn) submitBtn.disabled = false;
    };

    const removeFileSingle = async (fileName, dir) => {
        if (!confirm(`Czy na pewno usunąć "${fileName}"?`)) return;
        try {
            await api.deleteFile(fileName, dir);
            await loadAndRenderLists();
            showToast('Plik usunięty pomyślnie.');
            toggleFileSelect({ dataset: { filename: fileName } }, false, dir); // Clear selection
        } catch (err) {
            showToast('Błąd usuwania pliku.', 'error');
        }
    };

    const init = () => {
        loadAndRenderLists();
        renderPendingList();
        updateCounts();
        updateUploadButton();
        updateSelectAllButtons('uploads');
        updateSelectAllButtons('converted');

        subscribe((state) => {
            const appLayout = dom.getElement('#appLayout');
            if (appLayout) appLayout.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
            const sidebar = dom.getElement('#sidebar');
            if (sidebar) sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
            const header = dom.getElement('#header');
            const mainContent = dom.getElement('#mainContent');
            if (header) header.classList.toggle('collapsed-margin', state.sidebarCollapsed);
            if (mainContent) mainContent.classList.toggle('collapsed-margin', state.sidebarCollapsed);
            const toggleIcon = dom.getElement('#sidebarToggle i');
            if (toggleIcon) toggleIcon.className = state.sidebarCollapsed ? 'fas fa-times' : 'fas fa-bars';

            const dropZone = dom.getElement('#dropZone');
            if (dropZone) dropZone.classList.toggle('show', state.dragCounter > 0);

            updateCounts();
            if (state.currentTab === 'uploads') updateSelectAllButtons('uploads');
            if (state.currentTab === 'converted') updateSelectAllButtons('converted');
        });

        const defaultOpen = dom.getElement('#defaultOpen');
        if (defaultOpen) setTimeout(() => defaultOpen.click(), 0); // Delay to avoid init issues

        window.addEventListener('beforeunload', revokeAllUrls);
    };

    // Expose
    window.openTab = openTab;
    window.removePendingFile = removePendingFile;
    window.toggleFileSelect = toggleFileSelect;
    window.openConvertModal = openConvertModal;
    window.removeFileSingle = removeFileSingle;
    window.downloadFile = api.downloadFile;
    window.selectAll = toggleSelectAll; // Now toggle
    window.batchConvert = batchConvert;
    window.batchDownload = batchDownload;
    window.batchDelete = batchDelete;
    window.refreshLists = loadAndRenderLists;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            bindEvents();
            init();
        });
    } else {
        bindEvents();
        init();
    }
})();
