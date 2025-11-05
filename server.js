// server.js - Pełny backend w czystym Node.js dla prototypu FFmpeg Media Manager
// Symuluje konwersję multimediów z FFmpeg, obsługuje API dla SPA front-endu
// Używa wbudowanych modułów: http, fs, path, url, child_process (dla symulacji CLI FFmpeg)
// Brak zewnętrznych zależności; storage w plikach JSON dla prostoty (tasks.json, history.json)
// Uruchomienie: node server.js (serwer na porcie 3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

// Konfiguracja
const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Utwórz katalogi jeśli nie istnieją
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Inicjalizuj storage (w pamięci + persistencja)
let tasks = loadJson(TASKS_FILE, []);
let history = loadJson(HISTORY_FILE, []);
let taskQueue = []; // Kolejka zadań do przetwarzania
let activeProcesses = new Map(); // Aktywne procesy konwersji

// EventEmitter dla symulacji postępu (jak w diagramie)
const EventEmitter = require('events');
const progressEmitter = new EventEmitter();

// Funkcje pomocnicze
function loadJson(file, defaultValue) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        return defaultValue;
    }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function validateFile(file) {
    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Nieobsługiwany typ pliku wideo.');
    }
    if (file.size > 200 * 1024 * 1024) { // 200MB
        throw new Error('Plik przekracza limit rozmiaru (200MB).');
    }
    return true;
}

function simulateFFmpegConversion(inputPath, outputPath, params, taskId) {
    // Symulacja FFmpeg via child_process.spawn (mock CLI)
    // W rzeczywistości: spawn('ffmpeg', args); tu symulujemy z opóźnieniem i eventami
    console.log(`Symulacja FFmpeg dla zadania ${taskId}: ${inputPath} -> ${outputPath}`);
    console.log('Parametry:', params);

    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        updateTaskProgress(taskId, Math.floor(progress));
        progressEmitter.emit(`progress:${taskId}`, { progress, step: getCurrentStep(progress) });

        if (progress >= 100) {
            clearInterval(interval);
            // Symuluj utworzenie pliku wyjściowego (mock blob-like)
            fs.writeFileSync(outputPath, `Mock converted file: ${path.basename(inputPath)}\nFormat: ${params.outputFormat}\n${JSON.stringify(params, null, 2)}`);
            completeTask(taskId, outputPath);
        }
    }, 800); // Symuluj etapy co 800ms

    activeProcesses.set(taskId, { interval, process: null }); // Mock process
}

function getCurrentStep(progress) {
    if (progress < 25) return 'init';
    if (progress < 50) return 'video';
    if (progress < 75) return 'audio';
    return 'mux';
}

function updateTaskProgress(taskId, progress) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.progress = progress;
        saveTasks();
    }
}

function completeTask(taskId, outputPath) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'completed';
        task.completed = new Date().toISOString();
        task.outputPath = outputPath;
        saveTasks();
        // Przenieś do historii
        const histEntry = { ...task };
        history.unshift(histEntry);
        saveHistory();
        // Emit completion
        progressEmitter.emit(`complete:${taskId}`, histEntry);
        activeProcesses.delete(taskId);
    }
}

function cancelTask(taskId) {
    const proc = activeProcesses.get(taskId);
    if (proc) {
        clearInterval(proc.interval);
        // proc.process.kill(); // W rzeczywistości
        activeProcesses.delete(taskId);
    }
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'cancelled';
        saveTasks();
    }
}

function saveTasks() {
    saveJson(TASKS_FILE, tasks);
}

function saveHistory() {
    saveJson(HISTORY_FILE, history);
}

// Obsługa kolejki zadań (jak w diagramie: queue task)
function queueTask(filePath, params, taskId) {
    const task = {
        id: taskId,
        name: path.basename(filePath),
        status: 'queued',
        progress: 0,
        started: new Date().toISOString(),
        params,
        inputPath: filePath
    };
    tasks.unshift(task);
    saveTasks();
    taskQueue.push({ taskId, filePath, params });
    processQueue();
}

function processQueue() {
    if (taskQueue.length > 0 && activeProcesses.size === 0) { // Tylko jedno zadanie na raz
        const { taskId, filePath, params } = taskQueue.shift();
        const task = tasks.find(t => t.id === taskId);
        if (task && task.status === 'queued') {
            task.status = 'processing';
            saveTasks();
            const outputName = path.basename(filePath, path.extname(filePath)) + '_converted.' + params.outputFormat;
            const outputPath = path.join(OUTPUT_DIR, outputName);
            simulateFFmpegConversion(filePath, outputPath, params, taskId);
        }
    }
}

// Serwer HTTP
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // POST /upload - Upload pliku (multipart/form-data symulacja via raw body)
    if (parsedUrl.pathname === '/upload' && method === 'POST') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body);
            // Symuluj parsowanie (w rzeczywistości użyj multiparty, ale czysto: załóż base64 lub raw)
            // Dla prostoty: załóż, że body to JSON z { name, type, size, data: base64 }
            try {
                const data = JSON.parse(buffer.toString());
                validateFile({ name: data.name, type: data.type, size: Buffer.from(data.data, 'base64').length });
                const filePath = path.join(UPLOAD_DIR, data.name);
                fs.writeFileSync(filePath, Buffer.from(data.data, 'base64'));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filePath, message: 'Plik załadowany' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // POST /convert - Rozpocznij konwersję
    if (parsedUrl.pathname === '/convert' && method === 'POST') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const { filePath, params } = JSON.parse(buffer.toString());
                const taskId = generateTaskId();
                queueTask(filePath, params, taskId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, taskId, message: 'Zadanie dodane do kolejki' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // GET /progress/:taskId - Pobierz postęp
    if (parsedUrl.pathname.startsWith('/progress/') && method === 'GET') {
        const taskId = parsedUrl.pathname.split('/')[2];
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(task));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Zadanie nie znalezione' }));
        }
        return;
    }

    // PUT /progress/:taskId - Aktualizuj (używane wewnętrznie, ale dla API)
    if (parsedUrl.pathname.startsWith('/progress/') && method === 'PUT') {
        const taskId = parsedUrl.pathname.split('/')[2];
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const updates = JSON.parse(buffer.toString());
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    Object.assign(task, updates);
                    saveTasks();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(404);
                    res.end();
                }
            } catch (err) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }

    // DELETE /progress/:taskId - Anuluj zadanie
    if (parsedUrl.pathname.startsWith('/progress/') && method === 'DELETE') {
        const taskId = parsedUrl.pathname.split('/')[2];
        cancelTask(taskId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Zadanie anulowane' }));
        return;
    }

    // GET /download/:taskId - Pobierz wynik
    if (parsedUrl.pathname.startsWith('/download/') && method === 'GET') {
        const taskId = parsedUrl.pathname.split('/')[2];
        const task = tasks.find(t => t.id === taskId) || history.find(h => h.id === taskId);
        if (task && task.outputPath && fs.existsSync(task.outputPath)) {
            const fileStream = fs.createReadStream(task.outputPath);
            res.writeHead(200, {
                'Content-Type': 'video/mp4', // Domyślnie; dostosuj wg params
                'Content-Disposition': `attachment; filename="${task.name}_converted.mp4"`
            });
            fileStream.pipe(res);
        } else {
            res.writeHead(404);
            res.end('Plik nie znaleziony');
        }
        return;
    }

    // GET /history - Pobierz historię
    if (parsedUrl.pathname === '/history' && method === 'GET') {
        const { search, sort } = parsedUrl.query;
        let filtered = [...history];
        if (search) {
            filtered = filtered.filter(h => h.name.toLowerCase().includes(search.toLowerCase()));
        }
        // Sort (prosty: date-desc default)
        filtered.sort((a, b) => sort === 'date-asc' ? new Date(a.completed) - new Date(b.completed) : new Date(b.completed) - new Date(a.completed));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(filtered));
        return;
    }

    // GET /tasks - Pobierz aktywne zadania
    if (parsedUrl.pathname === '/tasks' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
        return;
    }

    // DELETE /tasks/:taskId - Usuń zadanie
    if (parsedUrl.pathname.startsWith('/tasks/') && method === 'DELETE') {
        const taskId = parsedUrl.pathname.split('/')[2];
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // DELETE /history/:taskId - Usuń z historii
    if (parsedUrl.pathname.startsWith('/history/') && method === 'DELETE') {
        const taskId = parsedUrl.pathname.split('/')[2];
        history = history.filter(h => h.id !== taskId);
        saveHistory();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // DELETE /history - Wyczyść historię
    if (parsedUrl.pathname === '/history' && method === 'DELETE') {
        history = [];
        saveHistory();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // DELETE /tasks - Wyczyść zadania
    if (parsedUrl.pathname === '/tasks' && method === 'DELETE') {
        tasks = [];
        saveTasks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Obsługa statycznych plików (front-end)
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('Front-end nie znaleziony');
        }
        return;
    }

    // 404 dla nieznanych
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Nie znaleziono');
});

// WebSocket-like via long-polling dla postępu (symulacja EventEmitter)
server.on('request', (req, res) => {
    if (req.url === '/events' && req.method === 'GET') {
        const taskId = req.url.split('?')[1]?.split('=')[1]; // ?taskId=xxx
        if (taskId) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            const listener = (data) => {
                if (data.taskId === taskId) { // Filtruj po taskId
                    res.write(`data: ${JSON.stringify(data)}\n\n`);
                }
            };
            progressEmitter.on('progress', listener);
            req.on('close', () => {
                progressEmitter.removeListener('progress', listener);
            });
        } else {
            res.writeHead(400);
            res.end();
        }
    }
});

// Uruchom serwer
server.listen(PORT, () => {
    console.log(`Serwer FFmpeg Media Manager działa na http://localhost:${PORT}`);
    console.log(`Upload dir: ${UPLOAD_DIR}`);
    console.log(`Output dir: ${OUTPUT_DIR}`);
});

// Czyszczenie przy wyjściu
process.on('SIGINT', () => {
    activeProcesses.forEach(({ interval }) => clearInterval(interval));
    process.exit();
});
