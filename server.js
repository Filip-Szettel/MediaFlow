// server.js - Poprawiony dla batch konwersji (JSON files) i walidacji fields
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const url = require('url');

// Konfiguracja
const config = {
    port: 3000,
    uploadsDir: path.join(__dirname, 'uploads'),
    convertedDir: path.join(__dirname, 'converted'),
    wwwRoot: __dirname,
    maxFileSize: 1024 * 1024 * 100, // 100MB
    supportedNameRegex: /^[A-Za-z0-9\-_.\s]{1,255}$/,
    supportedFilenameRegex: /^[A-Za-z0-9\-_.\s]{1,251}\.[A-Za-z0-9]{3,4}$/
};

// Funkcje narzędziowe
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureDir = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
};

const getFilesInDir = async (dirPath) => {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isFile())
            .map(entry => entry.name)
            .sort();
    } catch {
        return [];
    }
};

const validateFile = (name, filename, size) => {
    if (!config.supportedNameRegex.test(name)) throw new Error(`Nieprawidłowa nazwa parametru: ${name}`);
    if (filename && !config.supportedFilenameRegex.test(filename)) throw new Error(`Nieprawidłowa nazwa pliku: ${filename}`);
    if (filename && size <= 0) throw new Error('Plik pusty'); // Walidacja tylko dla plików, pomijaj puste fields
    if (size > config.maxFileSize && filename) throw new Error(`Plik za duży: ${size} > ${config.maxFileSize}`);
};

const saveFile = async (content, filename) => {
    const safeName = filename.replace(/[^A-Za-z0-9\-_.\s]/g, '_');
    const filePath = path.join(config.uploadsDir, safeName);
    await fs.writeFile(filePath, content);
    return safeName;
};

// Parsowanie multipart (obsługuje multiple fields o tej samej nazwie jako array, walidacja pomija size=0 dla fields)
const parseMultipart = (fullBody, contentType) => {
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) throw new Error('Brak boundary w Content-Type');
    const boundary = `--${boundaryMatch[1]}`;
    const bodyStr = fullBody.toString('latin1');
    const boundaryReg = new RegExp(escapeRegExp(boundary), 'g');
    const parts = bodyStr.split(boundaryReg).slice(1, -1);

    const fields = {};
    const files = [];

    parts.forEach(part => {
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
            // Fields - obsługa multiple, bez usuwania cudzysłowów
            if (fields[name]) {
                if (!Array.isArray(fields[name])) fields[name] = [fields[name]];
                fields[name].push(content);
            } else {
                fields[name] = content;
            }
        }
    });

    return { fields, files };
};

// Funkcja konwersji
const convertFile = async (inputFile, format, resolution, crf, bitrate) => {
    const inputPath = path.join(config.uploadsDir, inputFile);
    const outputName = inputFile.replace(/\.[^/.]+$/, `.${format}`);
    const outputPath = path.join(config.convertedDir, outputName);

    const ffmpegArgs = ['-i', inputPath];
    if (resolution) ffmpegArgs.push('-s', resolution);
    if (bitrate) ffmpegArgs.push('-b:v', bitrate);
    ffmpegArgs.push('-crf', crf, outputPath);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
        ffmpeg.on('close', (code) => code === 0 ? resolve(outputName) : reject(new Error(`FFmpeg error: ${code}`)));
    });

    await fs.unlink(inputPath).catch(() => {});
    return outputName;
};

// Obsługa requestu
const handleRequest = async (req, res) => {
    const { pathname } = url.parse(req.url);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`); // Opcjonalny log dla debugowania

    // SPECJALNE ENDPOINTY - PRZED STATYCZNYMI PLIKAMI!
    if (pathname === '/files' && req.method === 'GET') {
        await Promise.all([ensureDir(config.uploadsDir), ensureDir(config.convertedDir)]);
        const [uploads, converted] = await Promise.all([
            getFilesInDir(config.uploadsDir),
            getFilesInDir(config.convertedDir)
        ]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ uploads, converted }));
        return;
    }

    if (pathname === '/upload' && req.method === 'POST') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', async () => {
            try {
                const fullBody = Buffer.concat(body);
                const contentType = req.headers['content-type'] || '';
                if (!contentType.includes('multipart/form-data')) throw new Error('Nieobsługiwany Content-Type');

                const { files } = parseMultipart(fullBody, contentType);
                await ensureDir(config.uploadsDir);

                const savedFiles = await Promise.all(
                    files.map(async ({ filename, content }) => saveFile(content, filename || randomUUID() + '.bin'))
                );

                console.log('Zapisane pliki:', savedFiles);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, files: savedFiles }));
            } catch (error) {
                console.error('Błąd uploadu:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    if (pathname === '/convert' && req.method === 'POST') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', async () => {
            try {
                const fullBody = Buffer.concat(body);
                const contentType = req.headers['content-type'] || '';
                if (!contentType.includes('multipart/form-data')) throw new Error('Nieobsługiwany Content-Type');

                const { fields } = parseMultipart(fullBody, contentType);
                const filesJson = fields.files;
                if (!filesJson) throw new Error('Brak plików do konwersji');
                const inputFiles = Array.isArray(filesJson) ? filesJson : JSON.parse(filesJson);
                const format = fields.format || 'mp4';
                const resolution = fields.resolution || '';
                const crf = fields.crf || '23';
                const bitrate = fields.bitrate || '';

                await ensureDir(config.convertedDir);

                const outputs = await Promise.all(
                    inputFiles.map(inputFile => convertFile(inputFile, format, resolution, crf, bitrate))
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, outputs }));
            } catch (error) {
                console.error('Błąd konwersji:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    if (pathname.startsWith('/delete/') && req.method === 'DELETE') {
        const parts = pathname.split('/').slice(2);
        if (parts.length !== 2) {
            res.writeHead(400);
            res.end('Nieprawidłowa ścieżka');
            return;
        }
        const [fileName, dirType] = parts;
        const dirPath = dirType === 'uploads' ? config.uploadsDir : config.convertedDir;
        const filePath = path.join(dirPath, decodeURIComponent(fileName));
        try {
            await fs.unlink(filePath);
            res.writeHead(200);
            res.end('Usunięto');
        } catch {
            res.writeHead(404);
            res.end('Nie znaleziono');
        }
        return;
    }

    // Obsługa download (nowa)
    if (pathname.startsWith('/download/')) {
        await ensureDir(config.convertedDir);
        const fileName = decodeURIComponent(pathname.split('/')[2]);
        const fullPath = path.join(config.convertedDir, fileName);
        try {
            const content = await fs.readFile(fullPath);
            const ext = path.extname(fileName).toLowerCase();
            const mimeType = {
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.avi': 'video/x-msvideo',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.gif': 'image/gif',
                '.jpg': 'image/jpeg',
                '.png': 'image/png'
            }[ext] || 'application/octet-stream';
            res.writeHead(200, { 
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${fileName}"`
            });
            res.end(content);
        } catch {
            res.writeHead(404);
            res.end('Nie znaleziono pliku');
        }
        return;
    }

    // Thumbnail/Preview
    const serveFile = async (pathname, dir, res) => {
        const fileName = decodeURIComponent(pathname.split('/')[2]);
        const fullPath = path.join(dir, fileName);
        try {
            const content = await fs.readFile(fullPath);
            const ext = path.extname(fileName).toLowerCase();
            const mimeType = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav'
            }[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content);
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:2rem;">📁</div>');
        }
    };

    if (pathname.startsWith('/thumbnail/')) {
        await ensureDir(config.uploadsDir);
        serveFile(pathname, config.uploadsDir, res);
        return;
    }

    if (pathname.startsWith('/preview/')) {
        await ensureDir(config.convertedDir);
        serveFile(pathname, config.convertedDir, res);
        return;
    }

    // OBSŁUGA PLIKÓW STATYCZNYCH - NA KONIEC, JAKO FALLBACK
    if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/thumbnail/') && !pathname.startsWith('/preview/') && !pathname.startsWith('/download/') && !pathname.startsWith('/delete/')) {
        const fileName = pathname === '/' ? 'index.html' : pathname.substring(1);
        const filePath = path.join(config.wwwRoot, fileName);
        try {
            const content = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogv': 'video/ogg'
            }[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content);
            return;
        } catch (error) {
            console.error('Błąd serwowania pliku statycznego:', error);
        }
    }

    res.writeHead(404);
    res.end('Nie znaleziono');
};

// Serwer
const server = http.createServer(handleRequest);
server.listen(config.port, () => {
    console.log(`Serwer działa na http://localhost:${config.port}`);
});

// Inicjalizacja
Promise.all([ensureDir(config.uploadsDir), ensureDir(config.convertedDir)])
    .then(() => console.log('Foldery gotowe'))
    .catch(console.error);
