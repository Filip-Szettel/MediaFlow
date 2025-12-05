/**
 * ============================================================================
 * MEDIAFLOW WORKER v4.5 - FFmpeg Processor
 * ============================================================================
 * * Dedicated Thread for CPU-intensive media processing.
 * * Handles:
 * - FFmpeg process spawning and management
 * - Real-time progress parsing (Duration vs Time)
 * - Complex filter chains (GIF Palette, Scaling, CRF)
 * - Intelligent cleanup and error reporting
 * @version 4.5.0
 * @license MIT
 */

const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Configuration Constants
const CONFIG = {
    DIRS: {
        UPLOADS: path.join(__dirname, 'uploads'),
        CONVERTED: path.join(__dirname, 'converted'),
        TEMP: path.join(__dirname, 'temp') // For intermediate files like palettes
    },
    FFMPEG: {
        BINARY: 'ffmpeg',
        TIMEOUT: 0, // No timeout
        NICE_LEVEL: 10 // OS priority (if supported via nice, but logic handled by node)
    }
};

/**
 * Class encapsulating the FFmpeg conversion logic.
 * Designed to be instantiated once per worker thread execution.
 */
class FFmpegProcessor {
    constructor(data) {
        this.data = data;
        this.inputFile = data.inputFile;
        this.format = data.format;
        this.resolution = data.resolution;
        this.crf = data.crf;
        this.bitrate = data.bitrate;
        this.audioBitrate = data.audioBitrate;

        // Path setup
        this.inputPath = path.join(CONFIG.DIRS.UPLOADS, this.inputFile);
        
        // Generate output filename
        const namePart = path.parse(this.inputFile).name;
        // Ensure unique output name if needed, or overwrite based on flag (we use -y)
        this.outputFilename = `${namePart}_converted.${this.format}`;
        this.outputPath = path.join(CONFIG.DIRS.CONVERTED, this.outputFilename);
        
        this.durationSec = 0;
        this.lastProgress = -1;
    }

    /**
     * Main entry point for the conversion process.
     */
    async start() {
        const startTime = Date.now();
        
        try {
            await this.ensureDirectories();
            await this.validateInput();

            console.log(`[Worker] Starting processing: ${this.inputFile} -> ${this.format}`);

            if (this.format === 'gif') {
                await this.processGIF();
            } else {
                await this.processStandard();
            }

            // Cleanup original file if needed (optional logic, kept safe for now)
            // await fs.unlink(this.inputPath).catch(() => {}); 

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            parentPort.postMessage({ 
                success: true, 
                outputName: this.outputFilename,
                meta: { elapsed }
            });

        } catch (err) {
            console.error(`[Worker Error] ${err.message}`);
            
            // Try to cleanup partial output
            await fs.unlink(this.outputPath).catch(() => {});
            
            parentPort.postMessage({ 
                error: err.message,
                details: err.stack
            });
        }
    }

    /**
     * Ensures required directories exist.
     */
    async ensureDirectories() {
        await fs.mkdir(CONFIG.DIRS.UPLOADS, { recursive: true });
        await fs.mkdir(CONFIG.DIRS.CONVERTED, { recursive: true });
        await fs.mkdir(CONFIG.DIRS.TEMP, { recursive: true });
    }

    /**
     * Checks if input file exists and is readable.
     */
    async validateInput() {
        try {
            await fs.access(this.inputPath);
        } catch (e) {
            throw new Error(`Input file not found: ${this.inputPath}`);
        }
    }

    /**
     * Handles High-Quality GIF generation using a 2-pass approach.
     * Pass 1: Generate optimal color palette.
     * Pass 2: Apply palette to generate GIF.
     */
    async processGIF() {
        const palettePath = path.join(CONFIG.DIRS.TEMP, `palette_${Date.now()}.png`);
        
        // --- Pass 1: Generate Palette ---
        // Filters: fps limit, scale, lanczos interpolation, palettegen
        const fps = 15; // Good balance for GIFs
        const scaleFilter = this.resolution 
            ? `scale=${this.resolution.replace('x', ':')}:flags=lanczos` 
            : 'scale=480:-1:flags=lanczos'; // Default reasonable size for GIF

        const filters1 = `fps=${fps},${scaleFilter},palettegen`;

        console.log('[Worker] GIF Pass 1: Generating Palette');
        await this.runFFmpeg([
            '-y', 
            '-i', this.inputPath, 
            '-vf', filters1, 
            palettePath
        ]);

        // --- Pass 2: Render GIF ---
        // Filters: scale (again), paletteuse with dither
        const filters2 = `fps=${fps},${scaleFilter} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`;

        console.log('[Worker] GIF Pass 2: Rendering');
        await this.runFFmpeg([
            '-y',
            '-i', this.inputPath,
            '-i', palettePath,
            '-filter_complex', filters2,
            this.outputPath
        ]);

        // Cleanup palette
        await fs.unlink(palettePath).catch(() => {});
    }

    /**
     * Handles standard Video/Audio conversion (MP4, WEBM, MP3, etc.).
     */
    async processStandard() {
        const args = ['-y', '-i', this.inputPath];

        // --- Video Codec Settings ---
        if (['mp4', 'mkv', 'mov'].includes(this.format)) {
            args.push('-c:v', 'libx264', '-preset', 'fast'); // 'fast' is good trade-off
            args.push('-pix_fmt', 'yuv420p'); // Ensure compatibility
            args.push('-movflags', '+faststart'); // Web optim
        } else if (this.format === 'webm') {
            args.push('-c:v', 'libvpx-vp9');
            args.push('-row-mt', '1'); // Multi-threading for VP9
        } else if (['mp3', 'wav', 'aac', 'flac'].includes(this.format)) {
            args.push('-vn'); // No video
        }

        // --- Quality Control (CRF vs Bitrate) ---
        // Only apply CRF/Bitrate if video exists
        if (!['mp3', 'wav', 'aac', 'flac'].includes(this.format)) {
            if (this.bitrate) {
                args.push('-b:v', this.bitrate);
            } else if (this.crf) {
                args.push('-crf', this.crf.toString());
            } else {
                // Default fallback
                args.push('-crf', '23'); 
            }
        }

        // --- Filters (Scaling) ---
        const filters = [];
        if (this.resolution) {
            // Handle "1920x1080" or "-1:720"
            const res = this.resolution.trim().replace('x', ':');
            filters.push(`scale=${res}`);
        }

        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }

        // --- Audio Settings ---
        if (this.audioBitrate) {
            args.push('-b:a', this.audioBitrate);
        }
        
        if (this.format === 'mp3') {
            args.push('-c:a', 'libmp3lame', '-q:a', '2'); // VBR High Quality
        }

        // Output
        args.push(this.outputPath);

        await this.runFFmpeg(args);
    }

    /**
     * Spawns the FFmpeg process and monitors standard error for progress.
     * @param {string[]} args - FFmpeg arguments
     */
    runFFmpeg(args) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(CONFIG.FFMPEG.BINARY, args, {
                cwd: __dirname,
                stdio: ['ignore', 'pipe', 'pipe'] // Ignore stdin, pipe out/err
            });

            let stderrBuffer = '';

            ffmpeg.stderr.on('data', (data) => {
                const str = data.toString();
                stderrBuffer += str;
                
                this.parseProgress(str);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    // Extract last few lines of error log for debugging
                    const errorLog = stderrBuffer.split('\n').slice(-10).join('\n');
                    reject(new Error(`FFmpeg exited with code ${code}. Log:\n${errorLog}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
            });
        });
    }

    /**
     * Parses FFmpeg stderr output to calculate percentage.
     * Looks for "Duration: HH:MM:SS" and "time=HH:MM:SS".
     * @param {string} logChunk - Chunk of stderr
     */
    parseProgress(logChunk) {
        // 1. Extract Duration (only once)
        if (this.durationSec === 0) {
            const durationMatch = logChunk.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (durationMatch) {
                const h = parseFloat(durationMatch[1]);
                const m = parseFloat(durationMatch[2]);
                const s = parseFloat(durationMatch[3]);
                this.durationSec = (h * 3600) + (m * 60) + s;
            }
        }

        // 2. Extract Current Time
        if (this.durationSec > 0) {
            const timeMatch = logChunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch) {
                const h = parseFloat(timeMatch[1]);
                const m = parseFloat(timeMatch[2]);
                const s = parseFloat(timeMatch[3]);
                const currentSec = (h * 3600) + (m * 60) + s;

                const percent = Math.min(99, Math.round((currentSec / this.durationSec) * 100));

                // Throttle updates: send only if changed
                if (percent !== this.lastProgress) {
                    this.lastProgress = percent;
                    parentPort.postMessage({ progress: percent });
                }
            }
        }
    }
}

// ==========================================================================
// WORKER EXECUTION
// ==========================================================================

// Wrap in async IFFE to handle top-level await if needed, or just cleaner scope
(async () => {
    if (!workerData) {
        console.error('Worker started without data.');
        process.exit(1);
    }

    const processor = new FFmpegProcessor(workerData);
    await processor.start();
})();
