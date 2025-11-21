// Obsługiwane rozszerzenia
const supportedExtensions = new Set([
    'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ogv', 'm4v',
    'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'
]);

// DOM Elements
const appLayout = document.getElementById('appLayout');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const header = document.getElementById('header');
const mainContent = document.getElementById('mainContent');
const dropZone = document.getElementById('dropZone');
const pendingList = document.getElementById('pendingList');
const uploadsList = document.getElementById('uploadsList');
const convertedList = document.getElementById('convertedList');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const pendingEmpty = document.getElementById('pendingEmpty');
const uploadsEmpty = document.getElementById('uploadsEmpty');
const convertedEmpty = document.getElementById('convertedEmpty');
const pendingCount = document.getElementById('pendingCount');
const uploadsCount = document.getElementById('uploadsCount');
const convertedCount = document.getElementById('convertedCount');
const currentTitle = document.getElementById('currentTitle');
const globalSearch = document.getElementById('globalSearch');

const modal = document.getElementById('convertModal');
const closeModal = document.querySelector('.close');
const convertForm = document.getElementById('convertForm');
const convertSubmit = convertForm.querySelector('.convert-submit');

const toast = document.getElementById('toast');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const convertProgressFill = document.getElementById('convertProgressFill');

// State Variables
let selectedFiles = [];
let fileUrls = new Map();
let currentFileToConvert = null;
let dragCounter = 0;
let selectedUploads = new Set();
let selectedConverted = new Set();
let currentTab = 'pending';
let sidebarCollapsed = false;

// Sidebar Toggle
sidebarToggle.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    appLayout.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    header.classList.toggle('collapsed-margin', sidebarCollapsed);
    mainContent.classList.toggle('collapsed-margin', sidebarCollapsed);
    sidebarToggle.querySelector('i').classList.toggle('fa-bars');
    sidebarToggle.querySelector('i').classList.toggle('fa-times');
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
});

// Load saved state
if (localStorage.getItem('sidebarCollapsed') === 'true') {
    sidebarToggle.click();
}

// Utility Functions
const showToast = (message, type = 'success') => {
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 4000);
};

const updateCounts = () => {
    pendingCount.textContent = `${selectedFiles.length} plików`;
    // Counts for other tabs updated in loadFilesLists
};

const updateBatchButtons = (section) => {
    const count = section === 'uploads' ? selectedUploads.size : selectedConverted.size;
    const batchDelete = document.querySelector(`#${section}Tab .batch-delete`);
    const batchConvert = document.querySelector(`#${section}Tab .batch-convert`);
    const batchDownload = document.querySelector(`#${section}Tab .batch-download`);
    if (batchDelete) batchDelete.style.display = count > 0 ? 'inline-flex' : 'none';
    if (batchConvert) batchConvert.style.display = count > 0 ? 'inline-flex' : 'none';
    if (batchDownload) batchDownload.style.display = count > 0 ? 'inline-flex' : 'none';
};

const selectAll = (section) => {
    const cards = document.querySelectorAll(`#${section}Tab .file-card`);
    cards.forEach(card => {
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (!checkbox.checked) {
            checkbox.checked = true;
            card.classList.add('selected');
            const fileName = card.dataset.filename;
            if (section === 'uploads') selectedUploads.add(fileName);
            else selectedConverted.add(fileName);
        }
    });
    updateBatchButtons(section);
    showToast(`${cards.length} plików zaznaczonych.`);
};

const batchDelete = async (section) => {
    const files = section === 'uploads' ? selectedUploads : selectedConverted;
    if (files.size === 0) return;
    if (!confirm(`Czy na pewno usunąć ${files.size} plików?`)) return;
    try {
        await Promise.all(Array.from(files).map(fileName => 
            fetch(`/delete/${encodeURIComponent(fileName)}/${section === 'uploads' ? 'uploads' : 'converted'}`, { method: 'DELETE' })
        ));
        loadFilesLists();
        showToast(`${files.size} plików usuniętych pomyślnie.`);
        if (section === 'uploads') selectedUploads.clear();
        else selectedConverted.clear();
        updateBatchButtons(section);
    } catch (error) {
        showToast('Błąd podczas usuwania plików.', 'error');
    }
};

const batchConvert = () => {
    if (selectedUploads.size === 0) return;
    currentFileToConvert = Array.from(selectedUploads);
    modal.classList.add('show');
    // Pre-fill form if needed
};

const batchDownload = () => {
    if (selectedConverted.size === 0) return;
    const files = Array.from(selectedConverted);
    files.forEach(fileName => {
        const link = document.createElement('a');
        link.href = `/download/${encodeURIComponent(fileName)}`;
        link.download = fileName;
        link.click();
    });
    showToast(`${files.length} plików pobranych.`);
};

const refreshLists = () => {
    loadFilesLists();
    renderPendingList();
    showToast('Listy odświeżone.');
};

// Vertical Tabs Navigation (W3Schools Style)
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove('active'); // Dodatek dla animacji
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add('active'); // Animacja fadeIn
    evt.currentTarget.className += " active";

    // Nasze dodatki: Update title i currentTab
    currentTab = tabName;
    const icon = evt.currentTarget.querySelector('i').classList[1].replace('fa-', '');
    const titleText = evt.currentTarget.querySelector('span').textContent;
    currentTitle.innerHTML = `<i class="fas fa-${icon}"></i> ${titleText}`;

    // Reset search dla nowej zakładki
    globalSearch.value = '';
    const currentGrid = document.querySelector(`#${tabName}List`);
    if (currentGrid) {
        const cards = currentGrid.querySelectorAll('.file-card');
        cards.forEach(card => card.style.display = 'block');
    }

    // Smooth scroll do top
    document.querySelector('.tab-content-container').scrollTop = 0;
}

// Get the element with id="defaultOpen" and click on it
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById("defaultOpen").click();
});

// Global Search
globalSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    // Implement search across all tabs - for now, filter visible list
    const currentGrid = document.querySelector(`#${currentTab}List`);
    if (currentGrid) {
        const cards = currentGrid.querySelectorAll('.file-card');
        cards.forEach(card => {
            const name = card.querySelector('.file-name').textContent.toLowerCase();
            card.style.display = name.includes(query) ? 'block' : 'none';
        });
    }
});

// Drag & Drop
const preventDefaults = e => {
    e.preventDefault();
    e.stopPropagation();
};

const handleDragEnter = e => {
    dragCounter++;
    if (dragCounter === 1) dropZone.classList.add('show');
};

const handleDragLeave = e => {
    dragCounter--;
    if (dragCounter === 0) dropZone.classList.remove('show');
};

const handleDrop = e => {
    preventDefaults(e);
    dragCounter = 0;
    dropZone.classList.remove('show');
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
};

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    [document, document.body, uploadZone].forEach(el => {
        el.addEventListener(eventName, preventDefaults, false);
        if (eventName === 'dragenter') el.addEventListener(eventName, handleDragEnter, false);
        if (eventName === 'dragleave') el.addEventListener(eventName, handleDragLeave, false);
        if (eventName === 'drop') el.addEventListener(eventName, handleDrop, false);
    });
});

// File Input
fileInput.addEventListener('change', (e) => {
    addFiles(Array.from(e.target.files));
    fileInput.value = ''; // Reset for multiple selections
});

const addFiles = (files) => {
    const validFiles = files.filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!supportedExtensions.has(ext)) {
            showToast(`"${file.name}" nie jest obsługiwanym formatem.`, 'error');
            return false;
        }
        return true;
    });
    if (validFiles.length > 0) {
        selectedFiles = [...new Set([...selectedFiles, ...validFiles])];
        renderPendingList();
        pendingEmpty.style.display = 'none';
        showToast(`${validFiles.length} plików dodanych do kolejki.`);
    }
};

// Render Pending List
const getFileIcon = (ext) => {
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'fas fa-image';
    if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'ogv', 'm4v'].includes(ext)) return 'fas fa-video';
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma'].includes(ext)) return 'fas fa-music';
    return 'fas fa-file';
};

const createLocalThumbnail = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const thumbnail = document.createElement('div');
    thumbnail.className = 'file-thumbnail';
    const icon = document.createElement('i');
    icon.className = getFileIcon(ext);
    thumbnail.appendChild(icon);

    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        const img = document.createElement('img');
        const url = URL.createObjectURL(file);
        img.src = url;
        img.style.position = 'absolute';
        img.onerror = () => img.remove();
        thumbnail.appendChild(img);
        fileUrls.set(file, url);
    } else if (['mp4', 'webm', 'ogv'].includes(ext)) {
        const video = document.createElement('video');
        const url = URL.createObjectURL(file);
        video.src = url;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.style.position = 'absolute';
        video.onerror = () => video.remove();
        thumbnail.appendChild(video);
        fileUrls.set(file, url);
    }
    return thumbnail;
};

const createPendingFileCard = (file, index) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
        <div class="file-thumbnail">${createLocalThumbnail(file).innerHTML}</div>
        <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
                <span>${(file.size / 1024 / 1024).toFixed(1)} MB</span>
                <span>${file.type || 'Nieznany typ'}</span>
            </div>
            <div class="file-progress">
                <div class="file-progress-fill"></div>
            </div>
            <div class="file-actions">
                <button class="file-action-btn file-action-danger" onclick="removePendingFile(${index})">
                    <i class="fas fa-trash"></i> Usuń
                </button>
            </div>
        </div>
    `;
    return card;
};

const renderPendingList = () => {
    pendingList.innerHTML = '';
    updateCounts();
    if (selectedFiles.length === 0) {
        pendingEmpty.style.display = 'block';
        return;
    }
    pendingEmpty.style.display = 'none';
    selectedFiles.forEach((file, index) => {
        pendingList.appendChild(createPendingFileCard(file, index));
    });
};

const removePendingFile = (index) => {
    const file = selectedFiles[index];
    const url = fileUrls.get(file);
    if (url) URL.revokeObjectURL(url);
    selectedFiles.splice(index, 1);
    renderPendingList();
    if (selectedFiles.length === 0) {
        document.querySelector('.upload-progress').style.display = 'none';
    }
    showToast('Plik usunięty z kolejki.');
};

// Upload Functionality
uploadBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('files', file));
    const uploadProgress = document.querySelector('.upload-progress');
    uploadProgress.style.display = 'block';
    const progressFill = uploadProgress.querySelector('.progress-fill');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wysyłanie...';

    try {
        const response = await fetch('/upload', { 
            method: 'POST', 
            body: formData
        });
        if (response.ok) {
            progressFill.style.width = '100%';
            showToast('Upload zakończony pomyślnie!');
            selectedFiles.forEach(file => {
                const url = fileUrls.get(file);
                if (url) URL.revokeObjectURL(url);
            });
            fileUrls.clear();
            selectedFiles = [];
            renderPendingList();
            loadFilesLists();
        } else {
            const err = await response.json();
            throw new Error(err.error || 'Błąd uploadu');
        }
    } catch (error) {
        showToast('Błąd uploadu: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            uploadProgress.style.display = 'none';
            progressFill.style.width = '0%';
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-plus"></i> Wybierz pliki';
        }, 1500);
    }
});

// Load Server Files
const loadFilesLists = async () => {
    try {
        const response = await fetch('/files');
        const { uploads, converted } = await response.json();
        renderServerList(uploadsList, uploads, true);
        renderServerList(convertedList, converted, false);
        uploadsCount.textContent = `${uploads.length} plików`;
        convertedCount.textContent = `${converted.length} plików`;
    } catch (error) {
        console.error('Błąd ładowania plików:', error);
        showToast('Błąd ładowania listy plików.', 'error');
    }
};

const createServerThumbnail = (fileName, isUpload) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const baseUrl = isUpload ? '/thumbnail/' : '/preview/';
    const iconClass = getFileIcon(ext);
    let thumbnailHTML = `<i class="${iconClass}" style="font-size: 3rem; opacity: 0.8; color: white;"></i>`;

    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        thumbnailHTML = `<img src="${baseUrl}${encodeURIComponent(fileName)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width:100%;height:100%;object-fit:cover; position: absolute;">${thumbnailHTML}`;
    } else if (['mp4', 'webm', 'ogv'].includes(ext)) {
        thumbnailHTML = `<video src="${baseUrl}${encodeURIComponent(fileName)}" muted loop autoplay onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" style="width:100%;height:100%;object-fit:cover; position: absolute;"></video>${thumbnailHTML}`;
    }
    return thumbnailHTML;
};

const renderServerList = (container, files, isUpload) => {
    container.innerHTML = '';
    const emptyEl = container.parentElement.querySelector('.empty-state');
    if (files.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';
    files.forEach(fileName => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.filename = fileName;
        const ext = fileName.split('.').pop().toLowerCase();
        const status = isUpload ? 'Gotowy do konwersji' : `Skonwertowany ${new Date().toLocaleDateString('pl-PL')}`;
        card.innerHTML = `
            <input type="checkbox" class="file-checkbox">
            <div class="file-thumbnail">
                ${createServerThumbnail(fileName, isUpload)}
                <div class="file-overlay">
                    <i class="fas fa-eye"></i>
                </div>
            </div>
            <div class="file-info">
                <div class="file-name">${fileName}</div>
                <div class="file-meta">
                    <span>${status}</span>
                    <span><i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="file-actions">
                    ${isUpload ? `
                        <button class="file-action-btn file-action-primary" onclick="openConvertModal('${fileName}')">
                            <i class="fas fa-magic"></i> Konwertuj
                        </button>
                    ` : `
                        <button class="file-action-btn file-action-download" onclick="downloadFile('${fileName}')">
                            <i class="fas fa-download"></i> Pobierz
                        </button>
                    `}
                    <button class="file-action-btn file-action-danger" onclick="removeFileSingle('${fileName}', ${isUpload})">
                        <i class="fas fa-trash"></i> Usuń
                    </button>
                </div>
            </div>
        `;
        const checkbox = card.querySelector('.file-checkbox');
        checkbox.addEventListener('change', () => toggleFileSelect(card, isUpload ? 'uploads' : 'converted'));
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'I') return;
            checkbox.checked = !checkbox.checked;
            toggleFileSelect(card, isUpload ? 'uploads' : 'converted');
        });
        container.appendChild(card);
    });
    updateBatchButtons(isUpload ? 'uploads' : 'converted');
};

const toggleFileSelect = (card, section) => {
    const checkbox = card.querySelector('input[type="checkbox"]');
    const fileName = card.dataset.filename;
    if (checkbox.checked) {
        card.classList.add('selected');
        if (section === 'uploads') selectedUploads.add(fileName);
        else selectedConverted.add(fileName);
    } else {
        card.classList.remove('selected');
        if (section === 'uploads') selectedUploads.delete(fileName);
        else selectedConverted.delete(fileName);
    }
    updateBatchButtons(section);
};

const removeFileSingle = async (fileName, isUpload) => {
    if (!confirm(`Czy na pewno usunąć "${fileName}"?`)) return;
    try {
        await fetch(`/delete/${encodeURIComponent(fileName)}/${isUpload ? 'uploads' : 'converted'}`, { method: 'DELETE' });
        loadFilesLists();
        showToast('Plik usunięty pomyślnie.');
        if (isUpload) selectedUploads.delete(fileName);
        else selectedConverted.delete(fileName);
        updateBatchButtons(isUpload ? 'uploads' : 'converted');
    } catch (error) {
        showToast('Błąd usuwania pliku.', 'error');
    }
};

const downloadFile = (fileName) => {
    const link = document.createElement('a');
    link.href = `/download/${encodeURIComponent(fileName)}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Pobieranie "${fileName}"...`);
};

// Modal Handling
const openConvertModal = (fileName) => {
    currentFileToConvert = fileName;
    convertSubmit.disabled = false;
    modal.classList.add('show');
};

closeModal.onclick = () => modal.classList.remove('show');
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
});

convertForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!currentFileToConvert) return;
    // Walidacja formularza (ulepszenie)
    const crfValue = parseInt(document.getElementById('crf').value);
    if (crfValue < 18 || crfValue > 28) {
        showToast('CRF musi być między 18 a 28.', 'error');
        return;
    }
    const isBatch = Array.isArray(currentFileToConvert);
    const files = isBatch ? currentFileToConvert : [currentFileToConvert];
    const formData = new FormData();
    formData.append('files', JSON.stringify(files));
    formData.append('format', document.getElementById('format').value);
    formData.append('resolution', document.getElementById('resolution').value);
    formData.append('crf', document.getElementById('crf').value);
    formData.append('bitrate', document.getElementById('bitrate').value);
    formData.append('audioBitrate', document.getElementById('audioBitrate').value);
    formData.append('advanced', document.getElementById('advanced').value);

    const convertProgress = document.querySelector('.convert-progress');
    convertProgress.style.display = 'block';
    convertSubmit.disabled = true;
    convertSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Konwertowanie...';

    try {
        const response = await fetch('/convert', { 
            method: 'POST', 
            body: formData
        });
        if (response.ok) {
            convertProgressFill.style.width = '100%';
            const result = await response.json();
            showToast(`Konwersja zakończona: ${result.outputs ? result.outputs.join(', ') : files.length + ' plików gotowych'}`);
            modal.classList.remove('show');
            loadFilesLists();
            if (isBatch) selectedUploads.clear();
            updateBatchButtons('uploads');
        } else {
            const err = await response.json();
            throw new Error(err.error || 'Błąd konwersji');
        }
    } catch (error) {
        showToast('Błąd konwersji: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            convertProgress.style.display = 'none';
            convertProgressFill.style.width = '0%';
            convertSubmit.disabled = false;
            convertSubmit.innerHTML = '<i class="fas fa-play"></i> Rozpocznij konwersję';
        }, 1500);
    }
};

// Ulepszenie: Ładuj settings jeśli potrzeba
if (currentTab === 'settings') {
    // Tutaj kod dla settings, np. fetch('/settings')
}

// Cleanup
window.addEventListener('beforeunload', () => {
    fileUrls.forEach(url => URL.revokeObjectURL(url));
});

// Initialization
renderPendingList();
loadFilesLists();
