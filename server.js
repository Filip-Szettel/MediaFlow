// server.js - Bez zmian w głównej logice, ale zaktualizowano logi dla lepszego trackingu czasu konwersji.
// Dodano metryki czasu w convert endpoint.

const http = require('http');
const cluster = require('cluster');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const url = require('url');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Konfiguracja
const config = {
    port: 3000,
    uploadsDir: path.join(__dirname, 'uploads'),
    convertedDir: path.join(__dirname, 'converted'),
    wwwRoot: __dirname,
    maxFileSize: 1024 * 1024 * 100, // 100MB
    supportedNameRegex: /^[A-Za-z0-9\-_.\s]{1,255}$/,
    supportedFilenameRegex: /^[A-Za-z0-9\-_.\s]{1,251}\.[A-Za-z0-9]{3,4}$/,
    logLevel: 'info', // 'debug', 'info', 'error'
};

// Logowanie
const log = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const workerId = cluster.isWorker ? ` [Worker ${cluster.worker.id} PID ${process.pid}]` : ' [Master]';
    const logMsg = `[${timestamp}] ${level.toUpperCase()}${workerId}: ${message}`;
    console.log(logMsg, meta);
    if (level === 'error') {
        console.error(logMsg, meta);
    }
};

const debugLog = (msg, meta) => config.logLevel === 'debug' && log('debug', msg, meta);
const infoLog = (msg, meta) => log('info', msg, meta);
const errorLog = (msg, meta) => log('error', msg, meta);

// Funkcje narzędziowe
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureDir = async (dirPath) => {
    try {
        await fs.access(dirPath);
        debugLog(`Katalog już istnieje: ${dirPath}`);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
        infoLog(`Utworzono katalog: ${dirPath}`);
    }
};

const getFilesInDir = async (dirPath) => {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = entries
            .filter(entry => entry.isFile())
            .map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                return fs.stat(fullPath).then(stat => ({ name: entry.name, size: stat.size, mtime: stat.mtime.getTime() }));
            });
        const resolvedFiles = await Promise.allSettled(files);
        return resolvedFiles
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value)
            .sort((a, b) => a.name.localeCompare(b.name)); // Domyślnie po nazwie
    } catch (err) {
        errorLog(`Błąd odczytu katalogu ${dirPath}:`, { error: err.message });
        return [];
    }
};

const validateFile = (name, filename, size) => {
    if (!config.supportedNameRegex.test(name)) throw new Error(`Nieprawidłowa nazwa parametru: ${name}`);
    if (filename && !config.supportedFilenameRegex.test(filename)) throw new Error(`Nieprawidłowa nazwa pliku: ${filename}`);
    if (filename && size <= 0) throw new Error('Plik pusty');
    if (filename && size > config.maxFileSize) throw new Error(`Plik za duży: ${size} > ${config.maxFileSize} bajtów`);
};

const sanitizeFilename = (filename) => filename.replace(/[^A-Za-z0-9\-_.\s]/g, '_');

// Streaming save dla plików (lepsze dla dużych plików)
const saveFileStream = async (contentBuffer, filename) => {
    const safeName = sanitizeFilename(filename);
    const filePath = path.join(config.uploadsDir, safeName);
    await fs.writeFile(filePath, contentBuffer);
    infoLog(`Zapisano plik: ${safeName} (${contentBuffer.length} bajtów)`);
    return safeName;
};

// Ulepszone parsowanie multipart z obsługą buforowania chunkami (dla dużych requestów)
let bodyBuffer = []; // Per request, ale w handlerze reset
const parseMultipart = (fullBody, contentType) => {
    debugLog('Parsowanie multipart', { size: fullBody.length });
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) throw new Error('Brak boundary w Content-Type');
    const boundary = `--${boundaryMatch[1]}`;
    const bodyStr = fullBody.toString('latin1');
    const boundaryReg = new RegExp(escapeRegExp(boundary), 'g');
    const parts = bodyStr.split(boundaryReg).slice(1, -1);

    const fields = {};
    const files = [];

    parts.forEach((part, index) => {
        debugLog(`Przetwarzanie części ${index + 1}/${parts.length}`);
        const [headersStr, ...contentParts] = part.split('\r\n\r\n');
        const content = contentParts.join('\r\n\r\n').replace(/\r?\n?$/, '');
        const headers = (headersStr || '').split('\r\n').reduce((acc, header) => {
            const match = header.match(/^([^:]+):\s*(.*)$/);
            return match ? { ...acc, [match[1].toLowerCase()]: match[2] } : acc;
        }, {});

        const dispositionMatch = headers['content-disposition'] ? headers['content-disposition'].match(/name="([^"]+)"(?:; filename="([^"]+)")?/) : null;
        if (!dispositionMatch) return;

        const [_, name, filename] = dispositionMatch;
        const size = Buffer.from(content, 'latin1').length;
        validateFile(name, filename, size);

        if (filename) {
            const fileContent = Buffer.from(content, 'latin1');
            files.push({ filename: filename.replace(/"/g, ''), content: fileContent, contentType: headers['content-type'] || '' });
        } else {
            // Fields - bez usuwania cudzysłowów, tylko trim dla JSON i innych
            const fieldValue = content.trim();
            if (fields[name]) {
                if (!Array.isArray(fields[name])) fields[name] = [fields[name]];
                fields[name].push(fieldValue);
            } else {
                fields[name] = fieldValue;
            }
        }
    });

    debugLog('Parsowanie zakończone', { fieldsCount: Object.keys(fields).length, filesCount: files.length });
    return { fields, files };
};

// Konwersja w worker_thread (asynchroniczna, nieblokująca głównego wątku)
const convertFileInThread = (inputFile, options) => {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        debugLog(`Tworzenie worker_thread dla: ${inputFile}`);
        const worker = new Worker(path.join(__dirname, 'converterWorker.js'), {
            workerData: { inputFile, ...options, startTime }
        });

        worker.on('message', (msg) => {
            if (msg.success) {
                const duration = (Date.now() - startTime) / 1000;
                infoLog(`Konwersja zakończona: ${inputFile} -> ${msg.outputName} (czas: ${duration}s)`);
                resolve(msg.outputName);
            } else if (msg.error) {
                const duration = (Date.now() - startTime) / 1000;
                errorLog(`Błąd konwersji w thread: ${inputFile} (czas: ${duration}s)`, { error: msg.error });
                reject(new Error(msg.error));
            }
        });

        worker.on('error', (err) => {
            errorLog(`Błąd worker_thread: ${inputFile}`, { error: err.message });
            reject(err);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                errorLog(`Worker_thread zakończony z kodem ${code}: ${inputFile}`);
                reject(new Error(`Worker_thread zakończony z kodem ${code}`));
            }
        });
    });
};

// Obsługa requestu (rozbudowana z lepszym error handling)
const handleRequest = async (req, res) => {
    const { pathname, query } = url.parse(req.url, true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    infoLog(`${req.method} ${pathname}`, { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });

    try {
        // Health check
        if (pathname === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', workers: cluster.isWorker ? 1 : cluster.workerCount || 1, timestamp: Date.now() }));
            return;
        }

        // Ładuj pliki z metadanymi
        if (pathname === '/files' && req.method === 'GET') {
            await Promise.all([ensureDir(config.uploadsDir), ensureDir(config.convertedDir)]);
            const sortBy = query.sortBy || 'name'; // Wsparcie dla sort z frontendu
            const [uploads, converted] = await Promise.all([
                getFilesInDir(config.uploadsDir).then(files => sortFiles(files, sortBy)),
                getFilesInDir(config.convertedDir).then(files => sortFiles(files, sortBy))
            ]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ uploads, converted }));
            return;
        }

        // Upload z buforowaniem (dla dużych: monitoruj size)
        if (pathname === '/upload' && req.method === 'POST') {
            let body = [];
            let totalSize = 0;
            req.on('data', (chunk) => {
                body.push(chunk);
                totalSize += chunk.length;
                if (totalSize > config.maxFileSize * 10) { // Limit na cały request
                    req.destroy(new Error('Request za duży'));
                }
            });
            req.on('end', async () => {
                try {
                    const fullBody = Buffer.concat(body);
                    const contentType = req.headers['content-type'] || '';
                    if (!contentType.includes('multipart/form-data')) throw new Error('Nieobsługiwany Content-Type');

                    const { files } = parseMultipart(fullBody, contentType);
                    await ensureDir(config.uploadsDir);

                    const savedFiles = await Promise.all(
                        files.map(async ({ filename, content }) => saveFileStream(content, filename))
                    );

                    infoLog('Upload zakończony pomyślnie', { files: savedFiles.length });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, files: savedFiles }));
                } catch (error) {
                    errorLog('Błąd uploadu:', { error: error.message, size: totalSize });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            return;
        }

        // Konwersja batch z worker_threads (równoległa w threadach per worker)
        if (pathname === '/convert' && req.method === 'POST') {
            let body = [];
            req.on('data', (chunk) => body.push(chunk));
            req.on('end', async () => {
                const convertStart = Date.now();
                try {
                    const fullBody = Buffer.concat(body);
                    const contentType = req.headers['content-type'] || '';
                    if (!contentType.includes('multipart/form-data')) throw new Error('Nieobsługiwany Content-Type');

                    const { fields } = parseMultipart(fullBody, contentType);
                    let filesJson = fields.files;
                    if (!filesJson) throw new Error('Brak plików do konwersji');
                    let inputFiles;
                    if (Array.isArray(filesJson)) {
                        // Jeśli multiple, weź pierwszy (lub połącz, ale zakładamy single)
                        inputFiles = JSON.parse(filesJson[0]);
                    } else {
                        inputFiles = JSON.parse(filesJson);
                    }
                    if (!Array.isArray(inputFiles)) throw new Error('Pliki muszą być tablicą');

                    const format = fields.format?.toString() || 'mp4';
                    const resolution = fields.resolution?.toString() || '';
                    const crf = parseInt(fields.crf) || 23;
                    const bitrate = fields.bitrate?.toString() || '';

                    // Walidacja opcji
                    if (crf < 18 || crf > 28) throw new Error('CRF musi być między 18-28');
                    if (!['mp4', 'webm', 'avi', 'mp3', 'wav', 'gif'].includes(format)) throw new Error('Nieobsługiwany format');

                    await ensureDir(config.convertedDir);

                    // Równoległa konwersja z worker_threads (limit concurrency do os.cpus().length jeśli potrzeba, ale Promise.all dla prostoty)
                    const numCpus = os.cpus().length;
                    infoLog(`Rozpoczynanie konwersji ${inputFiles.length} plików w ${numCpus} rdzeniach (threads)`);
                    const outputs = await Promise.allSettled(
                        inputFiles.map(inputFile => convertFileInThread(inputFile, { format, resolution, crf, bitrate }))
                    );

                    const successful = outputs
                        .filter(result => result.status === 'fulfilled')
                        .map(result => result.value);
                    const failed = outputs
                        .filter(result => result.status === 'rejected')
                        .map(result => result.reason.message);

                    const convertDuration = (Date.now() - convertStart) / 1000;
                    if (failed.length > 0) {
                        infoLog(`Nieudane konwersje: ${failed.length}/${inputFiles.length} (całkowity czas: ${convertDuration}s)`, { failed });
                    } else {
                        infoLog(`Konwersja batch zakończona pomyślnie (czas: ${convertDuration}s)`);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, outputs: successful, failed: failed.length, duration: convertDuration }));
                } catch (error) {
                    const convertDuration = (Date.now() - convertStart) / 1000;
                    errorLog('Błąd konwersji:', { error: error.message, duration: convertDuration });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            return;
        }

        // Delete z walidacją
        if (pathname.startsWith('/delete/') && req.method === 'DELETE') {
            const parts = pathname.split('/').slice(2);
            if (parts.length !== 2) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Nieprawidłowa ścieżka');
                return;
            }
            const [fileName, dirType] = parts;
            if (!config.supportedFilenameRegex.test(decodeURIComponent(fileName))) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Nieprawidłowa nazwa pliku');
                return;
            }
            const dirPath = dirType === 'uploads' ? config.uploadsDir : config.convertedDir;
            const filePath = path.join(dirPath, decodeURIComponent(fileName));
            try {
                await fs.unlink(filePath);
                infoLog(`Usunięto plik: ${fileName} z ${dirType}`);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Usunięto pomyślnie');
            } catch (err) {
                errorLog(`Błąd usuwania: ${fileName}`, { error: err.message });
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Nie znaleziono pliku');
            }
            return;
        }

        // Download z converted (rozbudowany MIME)
        if (pathname.startsWith('/download/')) {
            const fileName = decodeURIComponent(pathname.split('/')[2]);
            const fullPath = path.join(config.convertedDir, fileName);
            try {
                await fs.access(fullPath);
                const content = await fs.readFile(fullPath);
                const ext = path.extname(fileName).toLowerCase();
                const mimeType = getMimeType(ext);
                res.writeHead(200, { 
                    'Content-Type': mimeType,
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                    'Content-Length': content.length
                });
                res.end(content);
                infoLog(`Pobrano plik: ${fileName}`);
            } catch (err) {
                errorLog(`Błąd download: ${fileName}`, { error: err.message });
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Nie znaleziono pliku');
            }
            return;
        }

        // Thumbnail/Preview z placeholder
        const serveMediaFile = async (pathname, dir, endpointType, res) => {
            const fileName = decodeURIComponent(pathname.split('/')[2]);
            const fullPath = path.join(dir, fileName);
            try {
                await fs.access(fullPath);
                const content = await fs.readFile(fullPath);
                const ext = path.extname(fileName).toLowerCase();
                const mimeType = getMimeType(ext);
                res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=3600' });
                res.end(content);
                debugLog(`${endpointType} serwowany: ${fileName}`);
            } catch (err) {
                debugLog(`${endpointType} nie znaleziono, placeholder: ${fileName}`);
                // Prosty placeholder HTML/SVG dla błędów
                const placeholder = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="55" text-anchor="middle" fill="#999">📁</text></svg>`;
                res.writeHead(404, { 'Content-Type': 'image/svg+xml' });
                res.end(placeholder);
            }
        };

        if (pathname.startsWith('/thumbnail/')) {
            await ensureDir(config.uploadsDir);
            serveMediaFile(pathname, config.uploadsDir, 'Thumbnail', res);
            return;
        }

        if (pathname.startsWith('/preview/')) {
            await ensureDir(config.convertedDir);
            serveMediaFile(pathname, config.convertedDir, 'Preview', res);
            return;
        }

        // Statyczne pliki z cache
        if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/thumbnail/') && !pathname.startsWith('/preview/') && !pathname.startsWith('/download/') && !pathname.startsWith('/delete/') && !pathname.startsWith('/health')) {
            const fileName = pathname === '/' ? 'index.html' : pathname.substring(1);
            const filePath = path.join(config.wwwRoot, fileName);
            try {
                const content = await fs.readFile(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const mimeType = getMimeType(ext) || 'application/octet-stream';
                res.writeHead(200, { 
                    'Content-Type': mimeType,
                    'Cache-Control': ext === '.js' || ext === '.css' ? 'public, max-age=86400' : 'no-cache'
                });
                res.end(content);
                debugLog(`Serwowany statyczny: ${fileName}`);
            } catch (error) {
                errorLog('Błąd serwowania statycznego:', { error: error.message, file: fileName });
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Nie znaleziono</h1>');
            }
            return;
        }

        // Default 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Nie znaleziono zasobu');
    } catch (error) {
        errorLog('Nieoczekiwany błąd w handleRequest:', { error: error.message, pathname });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Wewnętrzny błąd serwera' }));
    }
};

// Helper: MIME types
const getMimeType = (ext) => ({
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma'
}[ext]);

// Helper: sortowanie plików
const sortFiles = (files, sortBy) => {
    switch (sortBy) {
        case 'size':
            return files.sort((a, b) => a.size - b.size);
        case 'date':
            return files.sort((a, b) => a.mtime - b.mtime);
        default:
            return files.sort((a, b) => a.name.localeCompare(b.name));
    }
};

// Cluster setup
if (!isMainThread || !cluster.isMaster) {
    // Worker: uruchom serwer
    const server = http.createServer(handleRequest);
    server.listen(config.port, () => {
        infoLog(`Worker ${cluster.worker ? cluster.worker.id : 'Unknown'} nasłuchuje na porcie ${config.port}`);
    });

    // Error handling per worker
    process.on('uncaughtException', (err) => {
        errorLog('Uncaught exception w workerze:', { error: err.message });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        errorLog('Unhandled rejection w workerze:', { reason, promise });
    });

    // Inicjalizacja katalogów na starcie (w workerach)
    Promise.all([ensureDir(config.uploadsDir), ensureDir(config.convertedDir)])
        .then(() => infoLog('Katalogi zainicjalizowane'))
        .catch(errorLog);
} else {
    // Master
    const numCPUs = os.cpus().length;
    const numWorkers = Math.max(1, numCPUs - 2);
    infoLog(`Master startuje ${numWorkers} workerów na ${numCPUs} rdzeniach`);

    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        errorLog(`Worker ${worker.process.pid} zakończony (kod: ${code}, signal: ${signal})`);
        // Restart
        setTimeout(() => cluster.fork(), 1000);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        infoLog('Master shutdown');
        cluster.disconnect();
        process.exit(0);
    });

    // Inicjalizacja katalogów w master (opcjonalnie)
    Promise.all([ensureDir(config.uploadsDir), ensureDir(config.convertedDir)])
        .then(() => infoLog('Katalogi zainicjalizowane'))
        .catch(errorLog);
}
