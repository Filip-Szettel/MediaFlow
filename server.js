/**
 * ============================================================================
 * MEDIAFLOW SERVER v5.4 - ENTERPRISE MONOLITH EDITION
 * ============================================================================
 * * A robust, production-grade Node.js server tailored for high-performance
 * media processing, streaming, and management.
 * * ARCHITECTURE OVERVIEW:
 * ----------------------
 * 1. CORE SERVER: Native HTTP/1.1 implementation with custom routing.
 * 2. SECURITY LAYER: Rate limiting, Path sanitization, CORS, Security Headers.
 * 3. UPLOAD ENGINE: Custom high-performance Multipart streaming parser.
 * 4. MEDIA STREAMER: Range-request compliant video streamer with error recovery.
 * 5. WORKER POOL: Multi-threaded FFmpeg processing with job queue management.
 * 6. EVENT BUS: Server-Sent Events (SSE) for real-time frontend synchronization.
 * 7. UTILITIES: File system abstraction, Metadata extraction, Logging.
 * * * FEATURES:
 * - Zero external dependencies (Pure Node.js)
 * - Crash-proof streaming implementation
 * - Detailed structured logging (with log levels)
 * - Automatic resource cleanup
 * - "Shadow" file locking mechanism (Hides incomplete conversions from Queue & Processing)
 * - ETag Support for efficient polling
 * @version 5.4.0
 * @license MIT
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { Worker } = require('worker_threads');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const url = require('url');

// ==========================================================================
// 1. GLOBAL CONFIGURATION MANAGER
// ==========================================================================

class ConfigManager {
    constructor() {
        this.env = process.env.NODE_ENV || 'development';
        
        // Base paths
        this.rootDir = __dirname;
        this.uploadDir = path.join(this.rootDir, 'uploads');
        this.convertedDir = path.join(this.rootDir, 'converted');
        this.tempDir = path.join(this.rootDir, 'temp');
        this.logsDir = path.join(this.rootDir, 'logs');

        // Server Settings
        this.port = parseInt(process.env.PORT || '3000', 10);
        this.host = process.env.HOST || '0.0.0.0';
        
        // Security Settings
        this.corsOrigin = '*'; // In production, change to specific domain
        this.maxUploadSize = 10 * 1024 * 1024 * 1024; // 10 GB
        this.rateLimitWindow = 60000; // 1 minute
        this.rateLimitMax = 2000; // requests per window (Increased for polling)

        // Processing Settings
        this.workerCount = Math.max(1, os.cpus().length - 2); // Leave 2 cores for OS/IO
        this.jobTimeout = 3600000; // 1 hour max per job
    }

    /**
     * validates and creates necessary directory structure
     */
    async init() {
        const dirs = [
            this.uploadDir, 
            this.convertedDir, 
            this.tempDir,
            this.logsDir
        ];

        for (const dir of dirs) {
            try {
                await fsPromises.access(dir);
            } catch {
                console.log(`[System] Initializing directory: ${dir}`);
                await fsPromises.mkdir(dir, { recursive: true });
            }
        }
    }
}

const CONFIG = new ConfigManager();

// ==========================================================================
// 2. ADVANCED LOGGER SYSTEM
// ==========================================================================

/**
 * Enterprise logging solution with color coding, levels, and metadata support.
 */
class Logger {
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4
    };

    static COLORS = {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        dim: '\x1b[2m',
        underscore: '\x1b[4m',
        
        fgBlack: '\x1b[30m',
        fgRed: '\x1b[31m',
        fgGreen: '\x1b[32m',
        fgYellow: '\x1b[33m',
        fgBlue: '\x1b[34m',
        fgMagenta: '\x1b[35m',
        fgCyan: '\x1b[36m',
        fgWhite: '\x1b[37m',
        
        bgRed: '\x1b[41m',
        bgGreen: '\x1b[42m',
        bgYellow: '\x1b[43m',
        bgBlue: '\x1b[44m'
    };

    static getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    static formatMeta(meta) {
        if (!meta) return '';
        if (meta instanceof Error) {
            return `\n${this.COLORS.fgRed}${meta.stack}${this.COLORS.reset}`;
        }
        try {
            return `\n${this.COLORS.dim}${JSON.stringify(meta, null, 2)}${this.COLORS.reset}`;
        } catch {
            return ` [Circular Metadata]`;
        }
    }

    static log(level, message, meta = null) {
        const ts = `[${this.getTimestamp()}]`;
        
        let levelTag = '';
        let color = this.COLORS.reset;

        switch (level) {
            case 'DEBUG':
                // In production, you might want to suppress DEBUG logs
                if (CONFIG.env === 'production') return; 
                levelTag = '[DEBUG]';
                color = this.COLORS.fgMagenta;
                break;
            case 'INFO':
                levelTag = '[INFO] ';
                color = this.COLORS.fgCyan;
                break;
            case 'SUCCESS':
                levelTag = '[OK]   ';
                color = this.COLORS.fgGreen;
                break;
            case 'WARN':
                levelTag = '[WARN] ';
                color = this.COLORS.fgYellow;
                break;
            case 'ERROR':
                levelTag = '[ERROR]';
                color = this.COLORS.fgRed;
                break;
            case 'FATAL':
                levelTag = '[FATAL]';
                color = this.COLORS.bgRed + this.COLORS.fgWhite;
                break;
        }

        const formattedMessage = `${this.COLORS.dim}${ts}${this.COLORS.reset} ${color}${this.COLORS.bright}${levelTag}${this.COLORS.reset} ${message} ${this.formatMeta(meta)}`;
        
        if (level === 'ERROR' || level === 'FATAL') {
            console.error(formattedMessage);
        } else {
            console.log(formattedMessage);
        }
    }

    static debug(msg, meta) { this.log('DEBUG', msg, meta); }
    static info(msg, meta) { this.log('INFO', msg, meta); }
    static success(msg, meta) { this.log('SUCCESS', msg, meta); }
    static warn(msg, meta) { this.log('WARN', msg, meta); }
    static error(msg, meta) { this.log('ERROR', msg, meta); }
    static fatal(msg, meta) { this.log('FATAL', msg, meta); }
}

// ==========================================================================
// 3. UTILITY LIBRARY
// ==========================================================================

const Utils = {
    /**
     * Sanitizes filenames to prevent directory traversal and special char issues.
     */
    sanitizeFilename: (filename) => {
        if (!filename) return `unknown_${Date.now()}`;
        // Remove null bytes
        const name = filename.replace(/\0/g, '');
        // Get basename to prevent ../ traversal
        const base = path.basename(name);
        // Replace non-safe chars
        return base.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    },

    /**
     * Determines MIME type based on file extension.
     */
    getMimeType: (ext) => {
        const types = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogv': 'video/ogg',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.aac': 'audio/aac',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf'
        };
        return types[ext.toLowerCase()] || 'application/octet-stream';
    },

    /**
     * Securely deletes a file without throwing if it doesn't exist.
     */
    safeDelete: async (filePath) => {
        try {
            await fsPromises.unlink(filePath);
            return true;
        } catch (e) {
            if (e.code !== 'ENOENT') {
                Logger.warn(`Failed to delete file: ${filePath}`, { error: e.message });
            }
            return false;
        }
    },

    /**
     * Generates a random UUID-like string.
     */
    generateId: () => {
        return crypto.randomBytes(16).toString('hex');
    },

    /**
     * Generates ETag from content
     */
    generateETag: (content) => {
        return crypto.createHash('md5').update(JSON.stringify(content)).digest('hex');
    },

    /**
     * Sleeps for ms duration.
     */
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// ==========================================================================
// 4. METADATA EXTRACTION ENGINE
// ==========================================================================

class MetadataEngine {
    /**
     * Spawns an ffprobe process to extract JSON metadata.
     */
    static async get(filePath) {
        return new Promise((resolve, reject) => {
            const args = [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ];

            const ffprobe = spawn('ffprobe', args);
            let rawData = '';
            let errorData = '';

            // Set a timeout
            const timeout = setTimeout(() => {
                ffprobe.kill();
                resolve(null);
            }, 5000); 

            ffprobe.stdout.on('data', chunk => rawData += chunk);
            ffprobe.stderr.on('data', chunk => errorData += chunk);

            ffprobe.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0 || !rawData) return resolve(null);

                try {
                    const json = JSON.parse(rawData);
                    resolve(this.normalize(json));
                } catch (e) {
                    resolve(null);
                }
            });

            ffprobe.on('error', (err) => {
                clearTimeout(timeout);
                resolve(null);
            });
        });
    }

    /**
     * Normalizes complex FFprobe JSON into a standard schema.
     */
    static normalize(data) {
        const format = data.format || {};
        const video = (data.streams || []).find(s => s.codec_type === 'video');
        const audio = (data.streams || []).find(s => s.codec_type === 'audio');

        return {
            duration: parseFloat(format.duration || 0),
            size: parseInt(format.size || 0),
            bitrate: parseInt(format.bit_rate || 0),
            format_name: format.format_long_name,
            video: video ? {
                codec: video.codec_name,
                width: video.width,
                height: video.height,
                fps: this.calculateFps(video.r_frame_rate),
                profile: video.profile,
                pix_fmt: video.pix_fmt
            } : null,
            audio: audio ? {
                codec: audio.codec_name,
                channels: audio.channels,
                sampleRate: audio.sample_rate,
                lang: audio.tags?.language || 'und'
            } : null
        };
    }

    static calculateFps(fraction) {
        if (!fraction) return 0;
        const [num, den] = fraction.split('/');
        if (!den) return parseFloat(num);
        return (parseInt(num) / parseInt(den)).toFixed(2);
    }
}

// ==========================================================================
// 5. STREAMING MULTIPART PARSER
// ==========================================================================

class MultipartParser {
    constructor(req, uploadDir) {
        this.req = req;
        this.uploadDir = uploadDir;
        this.boundary = this.getBoundary(req);
        this.results = { fields: {}, files: [] };
    }

    getBoundary(req) {
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('boundary=')) {
            throw new Error('Invalid Content-Type: Missing boundary');
        }
        return '--' + contentType.split('boundary=')[1].split(';')[0].trim();
    }

    async parse() {
        if (!this.boundary) throw new Error('No boundary found');

        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);
            let state = 'SEARCH_BOUNDARY'; 
            let currentFileStream = null;
            let currentMeta = null;

            const boundaryBuffer = Buffer.from(this.boundary);
            const doubleCRLF = Buffer.from('\r\n\r\n');

            this.req.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                
                while (true) {
                    if (state === 'SEARCH_BOUNDARY') {
                        const idx = buffer.indexOf(boundaryBuffer);
                        if (idx === -1) break; 
                        buffer = buffer.subarray(idx + boundaryBuffer.length);
                        state = 'READ_HEADER';
                    }
                    else if (state === 'READ_HEADER') {
                        if (buffer.indexOf('--') === 0 && buffer.length >= 2) {
                             buffer = Buffer.alloc(0);
                             return; 
                        }

                        const endIdx = buffer.indexOf(doubleCRLF);
                        if (endIdx === -1) break;

                        const headerStr = buffer.subarray(0, endIdx).toString();
                        buffer = buffer.subarray(endIdx + 4);

                        currentMeta = this.parseHeaders(headerStr);
                        
                        if (currentMeta.filename) {
                            const saveName = Utils.sanitizeFilename(currentMeta.filename);
                            const savePath = path.join(this.uploadDir, saveName);
                            currentFileStream = fs.createWriteStream(savePath);
                            currentMeta.saveName = saveName;
                            currentMeta.savePath = savePath;
                            state = 'READ_DATA_FILE';
                        } else {
                            state = 'READ_DATA_FIELD';
                        }
                    }
                    else if (state === 'READ_DATA_FILE') {
                        const boundaryIdx = buffer.indexOf(boundaryBuffer);
                        if (boundaryIdx !== -1) {
                            let dataEnd = boundaryIdx;
                            if (boundaryIdx >= 2 && buffer[boundaryIdx - 2] === 13 && buffer[boundaryIdx - 1] === 10) {
                                dataEnd -= 2;
                            }
                            const data = buffer.subarray(0, dataEnd);
                            currentFileStream.write(data);
                            currentFileStream.end();
                            this.results.files.push(currentMeta);
                            buffer = buffer.subarray(boundaryIdx + boundaryBuffer.length);
                            currentFileStream = null;
                            state = 'READ_HEADER';
                        } else {
                            const safetyMargin = boundaryBuffer.length + 4;
                            if (buffer.length > safetyMargin) {
                                const writeLen = buffer.length - safetyMargin;
                                currentFileStream.write(buffer.subarray(0, writeLen));
                                buffer = buffer.subarray(writeLen);
                            }
                            break; 
                        }
                    }
                    else if (state === 'READ_DATA_FIELD') {
                        const boundaryIdx = buffer.indexOf(boundaryBuffer);
                        if (boundaryIdx !== -1) {
                            let dataEnd = boundaryIdx;
                            if (boundaryIdx >= 2 && buffer[boundaryIdx - 2] === 13 && buffer[boundaryIdx - 1] === 10) {
                                dataEnd -= 2;
                            }
                            this.results.fields[currentMeta.name] = buffer.subarray(0, dataEnd).toString();
                            buffer = buffer.subarray(boundaryIdx + boundaryBuffer.length);
                            state = 'READ_HEADER';
                        } else {
                            break; 
                        }
                    }
                }
            });

            this.req.on('end', () => {
                if (currentFileStream) currentFileStream.end();
                resolve(this.results);
            });

            this.req.on('error', (err) => {
                if (currentFileStream) currentFileStream.destroy();
                reject(err);
            });
        });
    }

    parseHeaders(headerStr) {
        const meta = { name: null, filename: null };
        const contentDisp = headerStr.match(/Content-Disposition: form-data; ([^\r\n]+)/i);
        
        if (contentDisp) {
            const parts = contentDisp[1].split(';');
            parts.forEach(part => {
                const [key, val] = part.trim().split('=');
                if (val) {
                    const cleanVal = val.replace(/"/g, '');
                    if (key === 'name') meta.name = cleanVal;
                    if (key === 'filename') meta.filename = cleanVal;
                }
            });
        }
        return meta;
    }
}

// ==========================================================================
// 6. REAL-TIME EVENT BUS (SSE)
// ==========================================================================

class SSEManager {
    constructor() {
        this.clients = new Set();
        setInterval(() => this.broadcast(': heartbeat'), 15000);
    }

    addClient(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', 
            'Access-Control-Allow-Origin': CONFIG.corsOrigin
        });

        const clientId = Utils.generateId();
        res.write(`data: {"status": "connected", "id": "${clientId}"}\n\n`);
        const client = { id: clientId, res };
        this.clients.add(client);
        req.on('close', () => this.clients.delete(client));
    }

    broadcast(type, data) {
        const message = type.startsWith(':') ? `${type}\n\n` : `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach(client => {
            try { client.res.write(message); } 
            catch (e) { this.clients.delete(client); }
        });
    }
}

const sse = new SSEManager();

// ==========================================================================
// 7. WORKER POOL & JOB MANAGER
// ==========================================================================

class WorkerPool {
    constructor(limit) {
        this.limit = limit;
        this.active = 0;
        this.queue = [];
        this.workers = new Map();
        
        // Track output files being currently written (or queued to be written)
        this.processingOutputFiles = new Set();
    }

    /**
     * Determines expected output filename based on convention in worker.
     * Matches logic: `${namePart}_converted.${format}`
     */
    getExpectedOutputName(inputFile, format) {
        const namePart = path.parse(inputFile).name;
        return `${namePart}_converted.${format}`;
    }

    addJob(jobData) {
        if (this.queue.find(j => j.fileName === jobData.fileName)) {
            Logger.warn(`Job already in queue: ${jobData.fileName}`);
            return;
        }

        // --- LOCK OUTPUT FILE IMMEDIATELY ---
        // This prevents the "Converted" list from showing an old version of the file
        // or a partial file while it waits in queue or processes.
        const expectedOutput = this.getExpectedOutputName(jobData.fileName, jobData.options.format);
        this.processingOutputFiles.add(expectedOutput);

        this.queue.push(jobData);
        Logger.info(`Job queued: ${jobData.fileName}`, { queueLength: this.queue.length });
        this.processNext();
    }

    processNext() {
        if (this.active >= this.limit || this.queue.length === 0) return;
        const job = this.queue.shift();
        this.active++;
        this.spawnWorker(job);
    }

    spawnWorker(job) {
        // Output is already locked in addJob
        const expectedOutput = this.getExpectedOutputName(job.fileName, job.options.format);
        
        Logger.info(`Starting Worker`, { fileName: job.fileName, output: expectedOutput });
        sse.broadcast('start', { fileName: job.fileName });

        const worker = new Worker(path.join(CONFIG.rootDir, 'converterWorker.js'), {
            workerData: {
                inputFile: job.fileName, 
                format: job.options.format,
                resolution: job.options.resolution,
                crf: job.options.crf,
                bitrate: job.options.bitrate,
                audioBitrate: job.options.audioBitrate
            }
        });

        const jobId = Utils.generateId();
        this.workers.set(jobId, worker);

        worker.on('message', (msg) => {
            if (msg.progress !== undefined) {
                sse.broadcast('progress', { fileName: job.fileName, percent: msg.progress });
            } else if (msg.success) {
                this.cleanupWorker(jobId, job, true, msg.outputName);
            } else if (msg.error) {
                this.cleanupWorker(jobId, job, false, null, msg.error);
            }
        });

        worker.on('error', (err) => {
            this.cleanupWorker(jobId, job, false, null, err.message);
        });

        worker.on('exit', (code) => {
            if (code !== 0 && this.workers.has(jobId)) {
                this.cleanupWorker(jobId, job, false, null, `Worker exited with code ${code}`);
            }
        });
    }

    cleanupWorker(jobId, job, success, outputName, errorMsg) {
        if (!this.workers.has(jobId)) return;

        this.workers.delete(jobId);
        this.active--;

        // Unlock file visibility
        const expectedOutput = this.getExpectedOutputName(job.fileName, job.options.format);
        this.processingOutputFiles.delete(expectedOutput);

        if (success) {
            Logger.success(`Conversion Complete`, { fileName: job.fileName, output: outputName });
            sse.broadcast('complete', { fileName: job.fileName, outputFile: outputName });
        } else {
            Logger.error(`Conversion Failed`, { fileName: job.fileName, error: errorMsg });
            sse.broadcast('error', { fileName: job.fileName, error: errorMsg });
        }
        setImmediate(() => this.processNext());
    }

    /**
     * Checks if a filename is currently being processed or queued
     */
    isProcessing(filename) {
        return this.processingOutputFiles.has(filename);
    }
}

const workerPool = new WorkerPool(CONFIG.workerCount);

// ==========================================================================
// 8. SECURITY & RATE LIMITING
// ==========================================================================

class SecurityGuard {
    constructor() {
        this.requestCounts = new Map();
        setInterval(() => this.cleanup(), 300000);
    }

    cleanup() {
        const now = Date.now();
        for (const [ip, data] of this.requestCounts) {
            if (now - data.startTime > CONFIG.rateLimitWindow) {
                this.requestCounts.delete(ip);
            }
        }
    }

    checkRateLimit(req) {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        
        if (!this.requestCounts.has(ip)) {
            this.requestCounts.set(ip, { count: 1, startTime: now });
            return true;
        }

        const data = this.requestCounts.get(ip);
        if (now - data.startTime > CONFIG.rateLimitWindow) {
            data.count = 1;
            data.startTime = now;
            return true;
        }

        data.count++;
        if (data.count > CONFIG.rateLimitMax) {
            // Only log rate limit warnings occasionally to avoid flooding logs
            if (data.count % 100 === 0) {
                Logger.warn(`Rate Limit Exceeded`, { ip, count: data.count });
            }
            return false;
        }
        return true;
    }
}

const security = new SecurityGuard();

// ==========================================================================
// 9. ROUTER & REQUEST HANDLING
// ==========================================================================

class MediaServer {
    constructor() {
        this.routes = { GET: {}, POST: {}, DELETE: {}, OPTIONS: {} };
    }

    add(method, routePath, handler) {
        this.routes[method][routePath] = handler;
    }

    async handle(req, res) {
        this.setSecurityHeaders(res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (!security.checkRateLimit(req)) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too Many Requests' }));
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const pathName = parsedUrl.pathname;
        const method = req.method;

        // Reduced logging for frequent polling endpoints
        // Logs are generated ONLY for non-polling requests
        if (!['/files', '/events'].includes(pathName) && !pathName.startsWith('/media')) {
            Logger.debug(`${method} ${pathName}`);
        }

        try {
            const handler = this.matchRoute(method, pathName);
            if (handler) {
                await handler.fn(req, res, handler.params, parsedUrl.query);
            } else {
                await this.serveStatic(req, res, pathName);
            }
        } catch (err) {
            this.handleError(res, err, pathName);
        }
    }

    setSecurityHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    }

    matchRoute(method, pathName) {
        if (this.routes[method][pathName]) {
            return { fn: this.routes[method][pathName], params: {} };
        }
        for (const route of Object.keys(this.routes[method])) {
            if (route.endsWith('*')) {
                const prefix = route.slice(0, -1);
                if (pathName.startsWith(prefix)) {
                    return {
                        fn: this.routes[method][route],
                        params: { wildcard: pathName.slice(prefix.length) }
                    };
                }
            }
        }
        return null;
    }

    handleError(res, err, path) {
        if (res.headersSent) {
            // Logger.error('Error after headers sent', { path, error: err.message });
            return;
        }
        Logger.error('Request Handler Error', { path, error: err.message });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', requestId: Utils.generateId() }));
    }

    async serveStatic(req, res, urlPath) {
        if (urlPath.includes('..')) {
            res.writeHead(403);
            return res.end('Forbidden');
        }

        let filePath = path.join(CONFIG.rootDir, urlPath === '/' ? 'index.html' : urlPath);
        try {
            let stats = await fsPromises.stat(filePath);
            if (stats.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
                stats = await fsPromises.stat(filePath);
            }
            res.writeHead(200, {
                'Content-Type': Utils.getMimeType(path.extname(filePath)),
                'Content-Length': stats.size,
                'Cache-Control': 'public, max-age=3600'
            });
            fs.createReadStream(filePath).pipe(res);
        } catch (e) {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
}

const app = new MediaServer();

// ==========================================================================
// 10. ROUTE DEFINITIONS
// ==========================================================================

app.add('GET', '/events', (req, res) => {
    sse.addClient(req, res);
});

app.add('GET', '/files', async (req, res) => {
    const getStats = async (dir, type) => {
        try {
            const files = await fsPromises.readdir(dir);
            const validFiles = files.filter(f => !f.startsWith('.'));
            
            const stats = await Promise.all(validFiles.map(async f => {
                // HIDE FILES BEING PROCESSED
                // Checks both running jobs AND queued jobs
                if (type === 'converted' && workerPool.isProcessing(f)) {
                    return null; 
                }

                try {
                    const s = await fsPromises.stat(path.join(dir, f));
                    // Filter out 0 byte files
                    if (s.size === 0) return null;
                    
                    return { name: f, size: s.size, lastModified: s.mtimeMs };
                } catch { return null; }
            }));
            
            return stats.filter(Boolean);
        } catch { return []; }
    };

    const [uploads, converted] = await Promise.all([
        getStats(CONFIG.uploadDir, 'uploads'),
        getStats(CONFIG.convertedDir, 'converted')
    ]);

    const responseData = { uploads, converted };
    
    // --- ETAG IMPLEMENTATION ---
    // If the list hasn't changed, return 304 to save bandwidth and prevent UI flickering
    const currentETag = Utils.generateETag(responseData);
    
    if (req.headers['if-none-match'] === currentETag) {
        res.writeHead(304);
        return res.end();
    }

    res.writeHead(200, { 
        'Content-Type': 'application/json',
        'ETag': currentETag,
        'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(responseData));
});

app.add('GET', '/metadata/*', async (req, res, params) => {
    const parts = params.wildcard.split('/');
    const type = parts[0];
    const fileName = decodeURIComponent(parts[1]);

    if (!['uploads', 'converted'].includes(type) || !fileName) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Invalid parameters' }));
    }

    const dir = type === 'uploads' ? CONFIG.uploadDir : CONFIG.convertedDir;
    const filePath = path.join(dir, Utils.sanitizeFilename(fileName));

    try {
        await fsPromises.access(filePath);
        const meta = await MetadataEngine.get(filePath);
        
        if (meta) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(meta));
        } else {
            res.writeHead(422, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Metadata extraction failed' }));
        }
    } catch (e) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
    }
});

app.add('POST', '/upload', async (req, res) => {
    if (parseInt(req.headers['content-length']) > CONFIG.maxUploadSize) {
        res.writeHead(413);
        return res.end(JSON.stringify({ error: 'File too large' }));
    }
    const parser = new MultipartParser(req, CONFIG.uploadDir);
    try {
        const result = await parser.parse();
        Logger.success('Upload Successful', { count: result.files.length });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, files: result.files }));
    } catch (err) {
        Logger.error('Upload Failed', { error: err.message });
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
});

app.add('POST', '/convert', async (req, res) => {
    const parser = new MultipartParser(req, CONFIG.tempDir);
    try {
        const result = await parser.parse();
        const fileNames = JSON.parse(result.fields.files || '[]');
        const options = {
            format: result.fields.format || 'mp4',
            resolution: result.fields.resolution,
            crf: result.fields.crf || '23',
            bitrate: result.fields.bitrate,
            audioBitrate: result.fields.audioBitrate
        };

        if (fileNames.length === 0) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'No files specified' }));
        }

        let queued = 0;
        fileNames.forEach(fileName => {
            const safeName = Utils.sanitizeFilename(fileName);
            // This is synchronous and will lock the output name immediately
            workerPool.addJob({ fileName: safeName, options });
            queued++;
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, queued }));
    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
});

app.add('DELETE', '/delete/*', async (req, res, params) => {
    const parts = params.wildcard.split('/');
    const fileName = decodeURIComponent(parts[0]);
    const type = parts[1];
    
    if (!fileName || !type) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'Invalid path' }));
    }

    const dir = type === 'uploads' ? CONFIG.uploadDir : CONFIG.convertedDir;
    const success = await Utils.safeDelete(path.join(dir, Utils.sanitizeFilename(fileName)));

    if (success) {
        Logger.info(`Deleted file: ${fileName} (${type})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
    }
});

app.add('GET', '/download/*', async (req, res, params) => {
    const fileName = decodeURIComponent(params.wildcard);
    const filePath = path.join(CONFIG.convertedDir, Utils.sanitizeFilename(fileName));
    try {
        const stat = await fsPromises.stat(filePath);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': stat.size
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        res.writeHead(404);
        res.end('File not found');
    }
});

/**
 * FIXED MEDIA STREAMING HANDLER
 * Correctly handles Range requests and prevents "Headers already sent" errors
 */
app.add('GET', '/media/*', async (req, res, params) => {
    const parts = params.wildcard.split('/');
    const type = parts[0];
    const fileName = decodeURIComponent(parts[1]);
    const dir = type === 'uploads' ? CONFIG.uploadDir : CONFIG.convertedDir;
    const filePath = path.join(dir, Utils.sanitizeFilename(fileName));

    let stat;
    try {
        stat = await fsPromises.stat(filePath);
    } catch (e) {
        if (!res.headersSent) {
            res.writeHead(404);
            res.end('File Not Found');
        }
        return;
    }

    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = Utils.getMimeType(path.extname(fileName));

    // Handle empty file (being created) gracefully
    if (fileSize === 0) {
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': 0 });
        return res.end();
    }

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (start >= fileSize) {
            res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
            return res.end();
        }

        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType,
        });

        fileStream.on('open', () => fileStream.pipe(res));
        fileStream.on('error', (err) => {
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Stream Error');
            }
        });
        res.on('close', () => fileStream.destroy());
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
        });
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Stream Error');
            }
        });
        res.on('close', () => fileStream.destroy());
    }
});

// ==========================================================================
// 11. BOOTSTRAP
// ==========================================================================

const startServer = async () => {
    console.clear();
    console.log('\x1b[36m');
    console.log('█▀▄▀█ █▀▀ █▀▄ █ ▄▀█ █▀▀ █   █▀█ █   █');
    console.log('█ ▀ █ ██▄ █▄▀ █ █▀█ █▀  █▄▄ █▄█ ▀▄▀▄▀');
    console.log('        Server v5.4 Enterprise       ');
    console.log('\x1b[0m');

    await CONFIG.init();
    const server = http.createServer((req, res) => app.handle(req, res));

    server.keepAliveTimeout = 60000;
    server.headersTimeout = 65000;

    server.listen(CONFIG.port, CONFIG.host, () => {
        Logger.success(`Server running at http://${CONFIG.host}:${CONFIG.port}`);
        Logger.info(`Environment`, {
            node: process.version,
            workers: CONFIG.workerCount,
            uploadLimit: '10GB'
        });
    });

    const shutdown = (signal) => {
        console.log('\n');
        Logger.warn(`Received ${signal}. Shutting down...`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

process.on('uncaughtException', (err) => Logger.fatal('Uncaught Exception', err));
process.on('unhandledRejection', (reason) => Logger.error('Unhandled Rejection', { reason }));

startServer().catch(err => {
    console.error('Bootstrap Failed:', err);
    process.exit(1);
});
