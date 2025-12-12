/**
 * ============================================================================
 * MEDIAFLOW PHOENIX CORE v7.5.2 (Enterprise Backend)
 * ============================================================================
 * * SYSTEM ARCHITECTURE:
 * --------------------
 * 1. Express Server    - REST API Gateway & Static File Server
 * 2. PouchDB Layer     - NoSQL Persistence (Assets, Users, Logs)
 * 3. Worker Pool       - Thread management & Load balancing (FFmpeg)
 * 4. Event Bus (SSE)   - Real-time client updates & heartbeat
 * 5. Guardrails System - Input validation & Logic safety checks
 * * COMPLIANCE:
 * - Meets "Wytyczne.md" specification.
 * - Fixes 'audio' profile extension bug.
 * - Implements Batch Processing Queue.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { Worker } = require('worker_threads');
const os = require('os');
const PouchDB = require('pouchdb');
const PouchFind = require('pouchdb-find');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const archiver = require('archiver');
const EventEmitter = require('events');

// --- DATABASE PLUGINS ---
PouchDB.plugin(PouchFind);

// --- GLOBAL CONFIGURATION & CONSTANTS ---
const CONFIG = {
    PORT: 3000,
    // Dynamic calculation of available threads (Leave 2 for OS/Node)
    MAX_SYSTEM_WORKERS: Math.max(1, os.cpus().length - 2),
    PIN: "1234", // Authorization Token (Mock)

    // Directory Structure
    DIRS: {
        ROOT: path.join(__dirname, '../runtime'),
        LIBRARY: path.join(__dirname, '../runtime/library'),
        DB: path.join(__dirname, '../runtime/data'),
        LOGS: path.join(__dirname, '../runtime/logs'),
        TEMP: path.join(__dirname, '../runtime/temp')
    },

    // System Defaults
    DEFAULTS: {
        USER_QUOTA: 1024 * 1024 * 1024, // 1GB default
        USER_THREADS: 2,
        UPLOAD_LIMIT: 2 * 1024 * 1024 * 1024 // 2GB
    }
};

// --- INITIALIZATION SEQUENCE ---

// 1. Ensure Directory Structure
Object.values(CONFIG.DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[System] Created directory: ${dir}`);
        } catch (e) {
            console.error(`[CRITICAL] Failed to create directory ${dir}:`, e);
            process.exit(1);
        }
    }
});

// 2. Database Initialization
const db = new PouchDB(path.join(CONFIG.DIRS.DB, 'mediaflow_assets_v2'));
const usersDb = new PouchDB(path.join(CONFIG.DIRS.DB, 'mediaflow_users_v2'));
const sysLogsDb = new PouchDB(path.join(CONFIG.DIRS.DB, 'mediaflow_logs_v1'));

// 3. Ensure Database Indexes
(async () => {
    try {
        await db.createIndex({ index: { fields: ['type', 'parentId', 'status', 'createdAt'] } });
        await usersDb.createIndex({ index: { fields: ['email', 'role'] } });
        await sysLogsDb.createIndex({ index: { fields: ['timestamp', 'level'] } });
        console.log('[System] Database indexes ensured.');
    } catch (e) {
        console.error('[System] Failed to create indexes:', e);
    }
})();

/**
 * ----------------------------------------------------------------------------
 * SERVICE LAYER
 * ----------------------------------------------------------------------------
 */

/**
 * Logger Service
 * Handles structured logging to both Console (colored) and Database (persistent).
 */
class Logger {
    static async log(level, module, message, meta = {}) {
        const entry = {
            _id: uuidv4(),
            timestamp: new Date().toISOString(),
            level,   // 'info', 'warn', 'error', 'success'
            module,  // 'API', 'WORKER', 'SYSTEM', 'AUTH'
            message,
            meta
        };

        // Console Output with ANSI Colors
        const colors = {
            error: '\x1b[31m',   // Red
            warn: '\x1b[33m',    // Yellow
            success: '\x1b[32m', // Green
            info: '\x1b[36m',    // Cyan
            reset: '\x1b[0m'
        };

        const color = colors[level] || colors.info;
        console.log(`${color}[${level.toUpperCase()}] [${module}] ${message}${colors.reset}`);

        // Async Fire-and-Forget DB Write
        // We don't await this to avoid blocking the main thread
        sysLogsDb.put(entry).catch(e => console.error('Log persistence failed:', e));
    }
}

/**
 * User Management Service
 * Handles quotas, roles, and initial setup.
 */
class UserManager {
    /**
     * Creates default users if the database is empty.
     */
    static async initDefaults() {
        try {
            const info = await usersDb.info();
            if (info.doc_count === 0) {
                await usersDb.bulkDocs([
                    {
                        _id: 'user_admin', type: 'user',
                        name: 'Super Admin', email: 'admin@mediaflow.pl',
                        role: 'SUPER_ADMIN',
                        quota: 10 * 1024 * 1024 * 1024, // 10GB
                        maxThreads: 4,
                        status: 'active',
                        createdAt: new Date().toISOString()
                    },
                    {
                        _id: 'user_demo', type: 'user',
                        name: 'Jan Kowalski', email: 'jan@demo.pl',
                        role: 'USER',
                        quota: 1 * 1024 * 1024 * 1024, // 1GB
                        maxThreads: 2,
                        status: 'active',
                        createdAt: new Date().toISOString()
                    }
                ]);
                Logger.log('success', 'AUTH', 'Initialized default user accounts');
            }
        } catch (e) {
            Logger.log('error', 'AUTH', 'Failed to init users', { error: e.message });
        }
    }

    /**
     * Checks if a user has enough storage quota.
     * @param {string} userId 
     * @param {number} incomingSize 
     * @returns {Promise<{allowed: boolean, reason?: string}>}
     */
    static async checkQuota(userId, incomingSize) {
        try {
            // NOTE: In a real multi-tenant app, we would query the user's specific folder size.
            // For this Enterprise demo, we check the global library size against a hard cap.
            const totalSize = await this.calculateDirectorySize(CONFIG.DIRS.LIBRARY);

            // Hard Cap: 50GB Global for this instance
            const GLOBAL_CAP = 50 * 1024 * 1024 * 1024;

            if (totalSize + incomingSize > GLOBAL_CAP) {
                return { allowed: false, reason: 'Global instance storage limit exceeded (50GB)' };
            }
            return { allowed: true };
        } catch (e) {
            return { allowed: false, reason: 'Quota check system failure' };
        }
    }

    /**
     * Recursively calculates directory size.
     */
    static async calculateDirectorySize(dirPath) {
        let size = 0;
        try {
            const files = await fsPromises.readdir(dirPath, { withFileTypes: true });
            for (const file of files) {
                const p = path.join(dirPath, file.name);
                if (file.isDirectory()) size += await this.calculateDirectorySize(p);
                else if (file.isFile()) size += (await fsPromises.stat(p)).size;
            }
        } catch (e) { /* ignore missing */ }
        return size;
    }
}

/**
 * Job Scheduler & Worker Pool
 * Manages the transcoding queue, spawns threads, and handles IPC.
 */
class JobScheduler extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.activeJobs = new Map(); // jobId -> Worker instance
        this.maxConcurrent = CONFIG.MAX_SYSTEM_WORKERS;
    }

    /**
     * Adds a new job to the processing queue.
     * @param {Object} jobData 
     */
    addJob(jobData) {
        this.queue.push(jobData);
        Logger.log('info', 'SCHEDULER', `Job queued: ${jobData.versionId}`, {
            profile: jobData.config.profile,
            queueLength: this.queue.length
        });
        this.processQueue();
    }

    /**
     * Internal loop to check available slots and spawn workers.
     */
    processQueue() {
        if (this.activeJobs.size >= this.maxConcurrent) return;
        if (this.queue.length === 0) return;

        const job = this.queue.shift();
        this.spawnWorker(job);
    }

    /**
     * Spawns a dedicated Node.js Worker Thread for FFmpeg processing.
     */
    spawnWorker(job) {
        const workerPath = path.join(__dirname, 'worker.js');

        // Passing data to worker thread
        const worker = new Worker(workerPath, { workerData: job });

        this.activeJobs.set(job.versionId, worker);
        this.updateJobStatus(job.versionId, 'processing');

        Logger.log('info', 'WORKER_POOL', `Spawned Worker ID: ${worker.threadId} for Job ${job.versionId}`);

        // --- WORKER EVENT HANDLERS ---

        worker.on('message', (msg) => this.handleMessage(job, msg));

        worker.on('error', (err) => this.handleError(job, err));

        worker.on('exit', (code) => {
            this.activeJobs.delete(job.versionId);
            if (code !== 0) {
                Logger.log('error', 'WORKER_POOL', `Worker stopped with non-zero exit code ${code}`);
                this.updateJobStatus(job.versionId, 'error', { error: `Exit Code ${code}` });
            }
            // Trigger next job in queue
            this.processQueue();
        });
    }

    /**
     * Handles IPC messages from Worker (Progress, Done, Error).
     */
    handleMessage(job, msg) {
        switch (msg.type) {
            case 'progress':
                // Relay progress to Frontend via SSE
                SSEManager.broadcast({
                    type: 'progress',
                    id: job.versionId,
                    percent: msg.percent,
                    eta: msg.eta
                });
                break;
            case 'done':
                Logger.log('success', 'WORKER', `Transcoding complete: ${job.outputFilename}`);
                this.finalizeJob(job, msg);
                break;
            case 'error':
                Logger.log('error', 'WORKER', `Logic error in worker: ${msg.error}`);
                this.updateJobStatus(job.versionId, 'error', { error: msg.error });
                break;
        }
    }

    handleError(job, err) {
        Logger.log('error', 'WORKER_POOL', `Uncaught Worker Exception`, { error: err.message });
        this.updateJobStatus(job.versionId, 'error', { error: err.message });
    }

    /**
     * Updates job status in Database and notifies clients.
     */
    async updateJobStatus(id, status, extra = {}) {
        try {
            const doc = await db.get(id);
            doc.status = status;
            if (status === 'processing' && !doc.startedAt) doc.startedAt = new Date().toISOString();
            if (status === 'error') doc.error = extra.error;
            await db.put(doc);

            // Notify frontend of error state immediately
            if (status === 'error') {
                SSEManager.broadcast({ type: 'error', id, error: extra.error });
            }
        } catch (e) {
            console.error('[System] DB Update Failed in JobStatus:', e);
        }
    }

    /**
     * Finalizes a successful job.
     */
    async finalizeJob(job, resultData) {
        try {
            const doc = await db.get(job.versionId);
            doc.status = 'ready';
            doc.completedAt = new Date().toISOString();
            doc.size = resultData.size;
            doc.metadata = resultData.metadata;

            // Handle thumbnail generation result
            if (resultData.thumbnail) doc.thumbnail = resultData.thumbnail;

            // Deep Metadata Probe for Versions (Ensure "FULL" metadata is available)
            if (doc.type === 'version') {
                try {
                    const absPath = path.join(job.outputDir, job.outputFilename);
                    const probe = await getSimpleProbe(absPath);
                    doc.probe = probe;
                } catch (probeErr) {
                    Logger.log('warn', 'WORKER', 'Failed to probe generated version', probeErr);
                }
            }

            await db.put(doc);
            SSEManager.broadcast({ type: 'complete', id: job.versionId, doc });
        } catch (e) {
            Logger.log('error', 'DB', 'Finalize Job DB Error', e);
        }
    }
}

const scheduler = new JobScheduler();

/**
 * SSE Manager (Real-time updates)
 * Manages Server-Sent Events connections.
 */
class SSEManager {
    static clients = new Set();

    static addClient(res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        });

        // Initial heartbeat to establish connection
        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        this.clients.add(res);
        return () => this.clients.delete(res);
    }

    static broadcast(data) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach(client => {
            // Ensure connection is still writable
            if (client.writable) {
                client.write(payload);
            } else {
                this.clients.delete(client);
            }
        });
    }
}

/**
 * ----------------------------------------------------------------------------
 * EXPRESS APPLICATION SETUP
 * ----------------------------------------------------------------------------
 */

const app = express();
app.use(cors());
app.use(express.json());

// --- MIDDLEWARES ---

// 1. Authorization Middleware
const authMiddleware = (req, res, next) => {
    // Public Routes (Streaming / Downloads with Token)
    if (req.path.startsWith('/api/stream') || req.path.startsWith('/media')) return next();
    if (req.path === '/api/download-zip' && req.query.token === CONFIG.PIN) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${CONFIG.PIN}`) {
        return res.status(401).json({ error: 'Unauthorized Access. Invalid Token.' });
    }
    next();
};

// 2. Request Logging Middleware
app.use((req, res, next) => {
    // Filter out noisy streaming/event requests from logs
    if (!req.path.includes('stream') && !req.path.includes('events')) {
        Logger.log('info', 'API', `${req.method} ${req.path}`);
    }
    next();
});

// --- ROUTES: SYSTEM & EVENTS ---

app.get('/api/events', (req, res) => {
    const disconnect = SSEManager.addClient(res);
    req.on('close', disconnect);
});

app.get('/api/status', authMiddleware, async (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        uptime: process.uptime(),
        activeWorkers: scheduler.activeJobs.size,
        queueLength: scheduler.queue.length,
        memory: {
            heapUsed: memory.heapUsed,
            rss: memory.rss
        },
        maxWorkers: CONFIG.MAX_SYSTEM_WORKERS
    });
});

// --- ROUTES: USERS (CRUD) ---

app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const result = await usersDb.find({ selector: { type: 'user' } });
        res.json(result.docs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/users', authMiddleware, async (req, res) => {
    try {
        const { name, email, role, quota, maxThreads, status } = req.body;

        if (!name || !email) return res.status(400).json({ error: 'Name and Email are required' });

        const newUser = {
            _id: `user_${Date.now()}`,
            type: 'user',
            name,
            email,
            role: role || 'USER',
            quota: quota || CONFIG.DEFAULTS.USER_QUOTA,
            maxThreads: maxThreads || CONFIG.DEFAULTS.USER_THREADS,
            status: status || 'active',
            createdAt: new Date().toISOString()
        };

        await usersDb.put(newUser);
        Logger.log('success', 'AUTH', `Created user: ${email}`);
        res.json(newUser);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    try {
        const doc = await usersDb.get(req.params.id);
        await usersDb.remove(doc);
        Logger.log('warn', 'AUTH', `Deleted user: ${doc.email}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES: LIBRARY & UPLOAD ---

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        // Guardrail: Check Quota
        const quotaCheck = await UserManager.checkQuota('user_demo', file.size || 0);
        if (!quotaCheck.allowed) {
            return cb(new Error(quotaCheck.reason));
        }

        const assetId = uuidv4();
        const dir = path.join(CONFIG.DIRS.LIBRARY, assetId, 'source');
        await fsPromises.mkdir(dir, { recursive: true });
        req.assetId = assetId;
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, `${name}_source${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: CONFIG.DEFAULTS.UPLOAD_LIMIT }
});

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or quota exceeded' });

    try {
        const assetId = req.assetId;
        const relativePath = path.relative(CONFIG.DIRS.LIBRARY, req.file.path);

        // Deep Analysis via ffprobe
        const probe = await getSimpleProbe(req.file.path);

        const assetDoc = {
            _id: assetId,
            type: 'asset',
            originalName: req.file.originalname,
            path: relativePath,
            mimetype: req.file.mimetype,
            size: req.file.size,
            createdAt: new Date().toISOString(),
            probe: probe,
            tags: [],
            ownerId: 'user_demo'
        };

        await db.put(assetDoc);

        // Trigger Automatic Thumbnail Generation
        scheduler.addJob({
            versionId: assetId, // Use assetId as job ID for main thumbnail
            inputPath: path.join(CONFIG.DIRS.LIBRARY, assetDoc.path),
            outputDir: path.dirname(path.join(CONFIG.DIRS.LIBRARY, assetDoc.path)),
            outputFilename: 'thumbnail.jpg',
            config: { profile: 'thumbnail_gen', inputIsImage: assetDoc.mimetype.startsWith('image/') },
            originalProbe: probe
        });

        Logger.log('success', 'API', `File uploaded: ${req.file.originalname} (${formatBytes(req.file.size)})`);
        res.json({ success: true, asset: assetDoc });

    } catch (e) {
        Logger.log('error', 'API', 'Upload processing error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/library', authMiddleware, async (req, res) => {
    try {
        const assets = await db.find({ selector: { type: 'asset' }, limit: 1000 });
        const versions = await db.find({ selector: { type: 'version' }, limit: 5000 });

        // Join Assets with their Versions
        const mapped = assets.docs.map(a => ({
            ...a,
            generatedVersions: versions.docs.filter(v => v.parentId === a._id)
        }));

        res.json(mapped);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/assets/:id', authMiddleware, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);

        if (doc.type === 'asset') {
            // Delete entire asset folder
            const assetDir = path.join(CONFIG.DIRS.LIBRARY, doc._id);
            if (fs.existsSync(assetDir)) {
                await fsPromises.rm(assetDir, { recursive: true, force: true });
            }
            await db.remove(doc);

            // Delete associated versions from DB
            const versions = await db.find({ selector: { parentId: doc._id } });
            for (const v of versions.docs) await db.remove(v);

        } else if (doc.type === 'version') {
            // Delete specific version file
            const p = path.join(CONFIG.DIRS.LIBRARY, doc.path);
            if (fs.existsSync(p)) await fsPromises.unlink(p);
            await db.remove(doc);
        }

        Logger.log('info', 'API', `Deleted ${doc.type}: ${doc._id}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.patch('/api/assets/:id', authMiddleware, async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        const updates = req.body;

        // whitelist allowed fields
        if (updates.archived !== undefined) doc.archived = updates.archived;

        await db.put(doc);
        Logger.log('info', 'API', `Updated asset ${doc._id}`, updates);
        res.json({ success: true, asset: doc });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES: CONVERSION & PROCESSING ---

app.post('/api/convert', authMiddleware, async (req, res) => {
    const { assetId, config } = req.body;
    // config schema: { profile, container, strategy, audio }

    try {
        const asset = await db.get(assetId);

        // --- GUARDRAIL 1: Anti-Upscaling ---
        // --- GUARDRAIL 1: Anti-Upscaling ---
        if (asset.probe && asset.probe.width && asset.probe.height) {
            const targetH = getProfileHeight(config.profile, config.height);
            // 99999 indicates "original" or "audio", so we skip the check
            if (targetH !== 99999 && targetH > asset.probe.height) {
                return res.status(400).json({
                    error: `BLOKADA: Wybrana jakość (${targetH}p) jest wyższa niż oryginał (${asset.probe.height}p). Wybierz "Original" lub niższą jakość.`
                });
            }
        }

        const versionId = uuidv4();
        const assetRoot = path.join(CONFIG.DIRS.LIBRARY, assetId);
        const outputDir = path.join(assetRoot, 'versions');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // --- EXTENSION LOGIC (Fixed for Audio) ---
        let ext = config.container || 'mp4';

        // Fix for Audio Profile: ensure extension is .mp3
        if (config.profile === 'audio' || config.profile === 'audio_mp3') {
            ext = 'mp3';
        }

        const outputFilename = `${config.profile}_${config.strategy || 'std'}_${Date.now()}.${ext}`;

        const versionDoc = {
            _id: versionId,
            type: 'version',
            parentId: assetId,
            profile: config.profile,
            status: 'queued',
            path: path.join(assetId, 'versions', outputFilename),
            createdAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            originalName: asset.originalName,
            container: ext, // Store container type explicitly
            config: config
        };

        await db.put(versionDoc);

        // Schedule Job
        scheduler.addJob({
            versionId,
            inputPath: path.join(CONFIG.DIRS.LIBRARY, asset.path),
            outputDir,
            outputFilename,
            config: {
                ...config,
                inputIsImage: asset.mimetype && asset.mimetype.startsWith('image/')
            },
            originalProbe: asset.probe
        });

        res.json({ success: true, versionId });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES: STREAMING & DOWNLOAD ---

app.get('/api/stream/:id', async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        let filePath = path.join(CONFIG.DIRS.LIBRARY, doc.path);

        // --- THUMBNAIL LOGIC ---
        if (req.query.thumb === 'true') {
            // For Assets: Thumbnail is in source folder
            if (doc.type === 'asset') {
                filePath = path.join(path.dirname(filePath), 'thumbnail.jpg');
            } else {
                // For Versions: Fallback to parent asset's thumbnail
                const assetRoot = path.resolve(CONFIG.DIRS.LIBRARY, doc.path, '../../');
                filePath = path.join(assetRoot, 'source', 'thumbnail.jpg');
            }

            if (!fs.existsSync(filePath)) {
                // Fallback: If it's an image, serve the original file
                if (doc.mimetype && doc.mimetype.startsWith('image/')) {
                    const originalPath = path.join(CONFIG.DIRS.LIBRARY, doc.path);
                    if (fs.existsSync(originalPath)) {
                        return res.sendFile(originalPath);
                    }
                }
                return res.status(404).send('No thumbnail');
            }
            return res.sendFile(filePath);
        }

        if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');

        // --- VIDEO STREAMING (Partial Content 206) ---
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        const commonHeaders = {
            'Content-Type': getMimeType(filePath),
        };
        if (req.query.download === 'true') {
            commonHeaders['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
        }

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                ...commonHeaders
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                ...commonHeaders
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        res.status(404).send('Asset not found in DB');
    }
});

// Bulk ZIP Download (Streaming Archiver)
app.post('/api/download-zip', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).send("Bad Request");

    res.attachment(`mediaflow_export_${Date.now()}.zip`);

    // Level 5 compression for speed/size balance
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('warning', err => {
        if (err.code === 'ENOENT') Logger.log('warn', 'ZIP', 'File not found during zip', err);
        else throw err;
    });

    archive.on('error', err => {
        Logger.log('error', 'ZIP', 'Archiver error', err);
        res.status(500).end();
    });

    archive.pipe(res);

    // Stream files into ZIP
    for (const id of ids) {
        try {
            const doc = await db.get(id);

            // 1. ADD SOURCE FILE
            const absPath = path.join(CONFIG.DIRS.LIBRARY, doc.path);
            let sourceNameInZip = doc.originalName;

            // If it's a version, we might want a different naming or just process as is. 
            // But main logic is for 'asset' type to include children.

            if (fs.existsSync(absPath)) {
                // If asset, put in root level of ZIP or specific folder?
                // Request implies "package". Let's put everything in a folder named after the asset? 
                // "Plik źródłowy oraz jego wszystkie przekonwertowane wersje."
                // Let's create a folder per asset if multiple assets, or just flat if 1?
                // Safest is to just replicate structure or put versions in a subfolder.

                if (doc.type === 'asset') {
                    // Add Source
                    archive.file(absPath, { name: sourceNameInZip });

                    // 2. FIND AND ADD VERSIONS
                    const versions = await db.find({ selector: { parentId: doc._id } });
                    for (const v of versions.docs) {
                        const vPath = path.join(CONFIG.DIRS.LIBRARY, v.path);
                        if (fs.existsSync(vPath)) {
                            archive.file(vPath, { name: `Versions/${v.profile}_${path.basename(v.path)}` });
                        }
                    }
                } else if (doc.type === 'version') {
                    // Just a single version requested?
                    // Just a single version requested?
                    archive.file(absPath, { name: path.basename(doc.path) });
                }
            }
        } catch (e) { /* skip missing files silently */ }
    }

    await archive.finalize();
});

// --- HELPER FUNCTIONS ---

function getProfileHeight(profile, customH) {
    if (profile === 'custom' && customH) return parseInt(customH, 10);
    if (profile === '1080p' || profile === 'mobile') return 1080;
    if (profile === '720p') return 720;
    if (profile === '480p') return 480;
    return 99999; // 'original' or 'audio'
}

function getMimeType(filename) {
    if (filename.endsWith('.mp4')) return 'video/mp4';
    if (filename.endsWith('.webm')) return 'video/webm';
    if (filename.endsWith('.mp3')) return 'audio/mpeg';
    if (filename.endsWith('.jpg')) return 'image/jpeg';
    return 'application/octet-stream';
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getSimpleProbe(filePath) {
    return new Promise(resolve => {
        const ff = spawn('ffprobe', [
            '-v', 'error',
            '-show_streams',
            '-show_format', // Include container format data
            '-show_entries', 'stream=index,codec_type,width,height,codec_name,bit_rate,duration,r_frame_rate,channels,sample_rate:format=duration,size,bit_rate,format_name',
            '-of', 'json',
            filePath
        ]);
        let data = '';
        ff.stdout.on('data', c => data += c);
        ff.on('close', () => {
            try {
                const json = JSON.parse(data);
                const video = json.streams.find(s => s.codec_type === 'video') || {};
                const audio = json.streams.find(s => s.codec_type === 'audio') || {};
                const format = json.format || {};

                // Return a structured object
                resolve({
                    width: video.width || 0,
                    height: video.height || 0,
                    duration: format.duration || video.duration, // Prefer container duration
                    size: format.size,
                    video,
                    audio,
                    format
                });
            } catch { resolve({ width: 0, height: 0, video: {}, audio: {} }); }
        });
    });
}

// --- SYSTEM BOOTSTRAP ---

UserManager.initDefaults().then(() => {
    app.listen(CONFIG.PORT, () => {
        console.log(`\n\x1b[35m[MEDIAFLOW PHOENIX v7.5.2]\x1b[0m Server online`);
        console.log(` -> Port: ${CONFIG.PORT}`);
        console.log(` -> Library: ${CONFIG.DIRS.LIBRARY}`);
        console.log(` -> Workers: ${CONFIG.MAX_SYSTEM_WORKERS} threads available`);
        console.log(` -> Audio Profile Fix: Applied`);
    });
});
