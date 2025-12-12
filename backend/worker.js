const { parentPort, workerData } = require('worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * ============================================================================
 * MEDIAFLOW WORKER v4.5 (Advanced Transcoder)
 * ============================================================================
 * * Features:
 * - Complex Geometry Filters (Crop, Pad, Scale)
 * - Aspect Ratio Protection (Guardrails)
 * - Audio Extraction Logic (Fix for MP3)
 * - Accurate Progress Tracking (ETA calculation)
 * - Thumbnail Generation Mode
 */

const { inputPath, outputDir, outputFilename, config, originalProbe } = workerData;
const outputPath = path.join(outputDir, outputFilename);

// --- HELPER CLASSES ---

/**
 * Builds FFmpeg complex filter strings based on strategy.
 */
class VideoFilterBuilder {
    constructor(sourceW, sourceH, targetW, targetH, strategy) {
        this.sW = sourceW;
        this.sH = sourceH;
        this.tW = targetW;
        this.tH = targetH;
        this.strategy = strategy;
        this.filters = [];
    }

    build() {
        if (!this.tW || !this.tH) return []; // Original resolution

        // GUARDRAIL: Anti-Upscaling hard check inside worker
        // If source is smaller than target, pass through without scaling
        if (this.sW < this.tW || this.sH < this.tH) {
            if (this.strategy !== 'scale') return [];
        }

        switch (this.strategy) {
            case 'crop':
                this._applyCropStrategy();
                break;
            case 'pad':
                this._applyPadStrategy();
                break;
            case 'scale':
            default:
                this._applyFitStrategy();
                break;
        }

        return this.filters;
    }

    _applyCropStrategy() {
        // 1. Scale so smaller dimension fits target (increase ratio)
        // 2. Crop to exact target dimensions
        this.filters.push(`scale=${this.tW}:${this.tH}:force_original_aspect_ratio=increase`);
        this.filters.push(`crop=${this.tW}:${this.tH}`);
    }

    _applyPadStrategy() {
        // 1. Scale so larger dimension fits target (decrease ratio)
        // 2. Pad with black bars to fill target
        this.filters.push(`scale=${this.tW}:${this.tH}:force_original_aspect_ratio=decrease`);
        this.filters.push(`pad=${this.tW}:${this.tH}:(ow-iw)/2:(oh-ih)/2:black`);
    }

    _applyFitStrategy() {
        // 1. Scale to fit, maintaining aspect ratio
        // 2. Pad to even numbers (required for H.264 chroma subsampling)
        this.filters.push(`scale=${this.tW}:${this.tH}:force_original_aspect_ratio=decrease`);
        this.filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
    }
}

// --- MAIN EXECUTION BLOCK ---

(async () => {
    try {
        log(`Starting job: ${outputFilename} [${config.profile}]`);

        // 0. Setup Resolutions based on Profile
        let targetRes = { w: null, h: null };
        if (config.profile === 'custom') {
            targetRes = {
                w: config.width ? parseInt(config.width, 10) : null,
                h: config.height ? parseInt(config.height, 10) : null
            };
        }
        else if (config.profile === '1080p') targetRes = { w: 1920, h: 1080 };
        else if (config.profile === '720p') targetRes = { w: 1280, h: 720 };
        else if (config.profile === '480p') targetRes = { w: 854, h: 480 };
        else if (config.profile === 'mobile') targetRes = { w: 1080, h: 1920 };

        // 1. Handle Thumbnail Generation Mode (Fast Path)
        if (config.profile === 'thumbnail_gen') {
            await generateThumbnail();
            return;
        }

        // 2. Build FFmpeg Command
        const command = ffmpeg();

        if (config.inputIsImage) {
            command.input(inputPath).inputOptions(['-loop 1']);
        } else {
            command.input(inputPath);
        }

        // --- AUDIO HANDLING ---
        const isAudioProfile = config.profile === 'audio' || config.profile === 'audio_mp3';

        if (config.audio === 'none') {
            command.noAudio();
        } else {
            // 1. Audio Codec
            if (config.audioCodec) command.audioCodec(config.audioCodec);
            else command.audioCodec(isAudioProfile ? 'libmp3lame' : 'aac');

            // 2. Bitrate
            if (config.audioBitrate) {
                if (config.audioBitrate === 'original') {
                    // Try to use original bitrate from probe
                    const srcRate = originalProbe?.audio?.bit_rate;
                    if (srcRate) command.audioBitrate(Math.round(srcRate / 1000) + 'k');
                    else command.audioBitrate('192k'); // Fallback safe
                } else {
                    command.audioBitrate(config.audioBitrate);
                }
            }
            else command.audioBitrate(isAudioProfile ? '192k' : '128k');

            // 3. Channels
            if (config.audioChannels) command.audioChannels(parseInt(config.audioChannels));

            if (isAudioProfile) command.noVideo();
        }

        // --- VIDEO HANDLING ---
        if (!isAudioProfile) {
            // 1. Video Codec
            let vCodec = config.videoCodec || (config.container === 'webm' ? 'libvpx-vp9' : 'libx264');

            // GUARDRAIL: WebM Incompatibility Check
            if (config.container === 'webm' && (vCodec === 'libx264' || vCodec === 'libx265')) {
                throw new Error('Format Error: WebM does not support H.264/H.265. Use VP9.');
            }

            command.videoCodec(vCodec);

            // 2. Output Options & Pixel Format
            const outputOpts = [];

            // Pixel Format (Default to yuv420p for compatibility if not specified)
            const pixFmt = config.pixFmt || 'yuv420p';
            outputOpts.push(`-pix_fmt ${pixFmt}`);

            // Codec-Specific Optimizations
            if (vCodec === 'libx264' || vCodec === 'libx265') {
                outputOpts.push('-preset fast');
                outputOpts.push('-movflags +faststart');
                // Only add profile/level for standard H264 (avoids conflicts with 10-bit or H265)
                if (vCodec === 'libx264' && pixFmt === 'yuv420p') {
                    outputOpts.push('-profile:v main', '-level 4.0');
                }
            } else if (vCodec === 'libvpx-vp9') {
                outputOpts.push('-crf 30', '-b:v 0');
            }

            if (outputOpts.length > 0) command.outputOptions(outputOpts);

            // Duration for Image-to-Video
            if (config.inputIsImage && config.duration) {
                command.outputOptions([`-t ${config.duration}`]);
                // Ensure framerate for static image
                command.outputOptions(['-r 30']);
            }

            // Filters & Geometry Logic
            const inputW = originalProbe?.width || 1920;
            const inputH = originalProbe?.height || 1080;

            const filterBuilder = new VideoFilterBuilder(
                parseInt(inputW), parseInt(inputH),
                targetRes.w, targetRes.h,
                config.strategy || 'scale'
            );

            const videoFilters = filterBuilder.build();
            if (videoFilters.length > 0) {
                command.videoFilters(videoFilters);
            }
        }

        // Output Container Format
        const ext = path.extname(outputFilename).substring(1); // mp4, webm, mp3

        // Map extensions to FFmpeg Muxer names
        const formatMap = {
            'mkv': 'matroska',
            'mp4': 'mp4',
            'webm': 'webm',
            'mov': 'mov',
            'avi': 'avi',
            'flv': 'flv',
            'wmv': 'asf', // WMV usually uses ASF container
            'mp3': 'mp3'
        };

        if (ext) {
            const fmt = formatMap[ext.toLowerCase()] || ext;
            command.format(fmt);
        }

        // 3. Event Listeners & Execution
        let lastPercent = 0;
        const startTime = Date.now();

        command
            .on('start', (cmd) => {
                log('FFmpeg command: ' + cmd);
                parentPort.postMessage({ type: 'start' });
            })
            .on('progress', (progress) => {
                // Calculate ETA logic
                const p = progress.percent || 0;

                // Throttle updates (don't spam main thread every 0.1%)
                if (p > lastPercent + 1) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const etaSeconds = p > 0 ? (elapsed / p) * (100 - p) : 0;

                    parentPort.postMessage({
                        type: 'progress',
                        percent: p,
                        eta: formatTime(etaSeconds)
                    });
                    lastPercent = p;
                }
            })
            .on('error', (err) => {
                log(`FFmpeg Error: ${err.message}`);
                parentPort.postMessage({ type: 'error', error: err.message });
            })
            .on('end', () => {
                // Final Check: Does output exist?
                if (!fs.existsSync(outputPath)) {
                    parentPort.postMessage({ type: 'error', error: 'Output file not found after processing' });
                    return;
                }

                const stats = fs.statSync(outputPath);
                parentPort.postMessage({
                    type: 'done',
                    size: stats.size,
                    metadata: {
                        resolution: targetRes.w ? `${targetRes.w}x${targetRes.h}` : 'Original',
                        codec: config.container === 'webm' ? 'vp9' : 'h264',
                        duration: (Date.now() - startTime) / 1000
                    }
                });
            });

        // 4. Run FFmpeg
        command.save(outputPath);

    } catch (e) {
        parentPort.postMessage({ type: 'error', error: e.message });
    }
})();

// --- SPECIALIZED FUNCTIONS ---

/**
 * Generates a thumbnail for the video using a separate, faster FFmpeg pass.
 */
function generateThumbnail() {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: (config.inputIsImage) ? ['0.1'] : ['20%'], // Take shot at 20% of video duration, or start for image
                filename: outputFilename,
                folder: outputDir,
                size: '640x?' // Scale width to 640, maintain aspect ratio
            })
            .on('end', () => {
                parentPort.postMessage({
                    type: 'done',
                    size: 0,
                    thumbnail: path.join(path.basename(path.dirname(outputPath)), outputFilename)
                });
                resolve();
            })
            .on('error', (err) => {
                parentPort.postMessage({ type: 'error', error: err.message });
                resolve(); // Don't crash worker on thumb fail, just resolve empty
            });
    });
}

function log(msg) {
    // Optional: Send log to parent to be saved in system logs
    // parentPort.postMessage({ type: 'log', message: msg });
}

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
}
