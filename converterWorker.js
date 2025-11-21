const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const config = {
    uploadsDir: path.join(__dirname, 'uploads'),
    convertedDir: path.join(__dirname, 'converted'),
};

async function convertFile() {
    const { inputFile, format, resolution, crf, bitrate, startTime } = workerData;
    const threadStart = Date.now();
    try {
        await fs.mkdir(config.uploadsDir, { recursive: true });
        await fs.mkdir(config.convertedDir, { recursive: true });

        const inputPath = path.join(config.uploadsDir, inputFile);
        const outputName = inputFile.replace(/\.[^/.]+$/, `.${format}`);
        const outputPath = path.join(config.convertedDir, outputName);

        // Sprawdź input
        await fs.access(inputPath);

        let ffmpegArgs = ['-i', inputPath, '-y']; // -y do nadpisywania zawsze

        // Optymalizacje w zależności od formatu
        if (format === 'gif') {
            // Specjalna obsługa GIF: dwuprzebiegowa z paletą dla szybkości i jakości
            const palettePath = path.join(config.convertedDir, 'palette.png');
            const tempOutput = path.join(config.convertedDir, 'temp.gif');

            // Krok 1: Generuj paletę (szybki, niski fps, mała rozdzielczość)
            let paletteArgs = ['-i', inputPath, '-vf', 'fps=10,scale=320:-1:flags=lanczos,palettegen'];
            if (resolution) {
                paletteArgs.splice(paletteArgs.length - 2, 1, `fps=10,scale=${resolution}:flags=lanczos,palettegen`);
            }
            paletteArgs.push(palettePath);

            console.log(`[Thread Worker] Krok 1 GIF (paleta): ${inputFile}`);
            await runFFmpeg(paletteArgs);

            // Krok 2: Konwertuj z paletą (ogranicz do 256 kolorów, dither)
            let gifArgs = ['-i', inputPath, '-i', palettePath, '-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle'];
            if (resolution) {
                gifArgs.splice(gifArgs.length - 2, 1, `[0:v]scale=${resolution}:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`);
            }
            if (bitrate) {
                gifArgs.push('-b:v', bitrate); // Dla GIF to limit loop etc., ale bitrate nie idealny
            }
            gifArgs.push(tempOutput);

            console.log(`[Thread Worker] Krok 2 GIF (konwersja): ${inputFile} -> ${outputName}`);
            await runFFmpeg(gifArgs);

            // Opcjonalnie: limituj długość GIF do np. 10s dla szybkości (usuń jeśli niepotrzebne)
            // const duration = 10; // sekundy
            // const trimArgs = ['-i', tempOutput, '-t', duration.toString(), '-y', outputPath];
            // await runFFmpeg(trimArgs);
            // await fs.unlink(tempOutput);

            // Usuń paletę i temp
            await fs.unlink(palettePath);
            // await fs.unlink(tempOutput); // jeśli trim

        } else {
            // Dla innych formatów: standardowe args z optymalizacjami
            if (resolution) ffmpegArgs.push('-s', resolution);
            if (bitrate) ffmpegArgs.push('-b:v', bitrate);
            if (format === 'mp4' || format === 'webm') {
                ffmpegArgs.push('-preset', 'fast', '-crf', crf.toString()); // Szybszy preset
            } else if (format === 'mp3' || format === 'wav') {
                ffmpegArgs.push('-vn'); // Wyłącz wideo dla audio
                if (format === 'mp3') ffmpegArgs.push('-b:a', '128k'); // Domyślny bitrate audio
            } else {
                ffmpegArgs.push('-crf', crf.toString()); // Ogólne
            }
            ffmpegArgs.push(outputPath);
        }

        console.log(`[Thread Worker] Konwertuję: ${inputFile} -> ${outputName}`);

        await runFFmpeg(ffmpegArgs);

        await fs.unlink(inputPath).catch(err => console.error('Błąd usuwania oryginału:', err));
        parentPort.postMessage({ success: true, outputName });
    } catch (error) {
        const threadDuration = (Date.now() - threadStart) / 1000;
        console.error(`Thread error (${threadDuration}s):`, error);
        parentPort.postMessage({ error: error.message });
    }
}

async function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args, { 
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: __dirname 
        });

        let ffmpegError = '';
        ffmpeg.stderr.on('data', (data) => {
            ffmpegError += data.toString();
            // Opcjonalnie loguj progress, ale dla szybkości pomiń
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg failed: ${code} - ${ffmpegError.trim() || 'Unknown'}`));
            }
        });

        ffmpeg.on('error', (err) => {
            reject(err);
        });
    });
}

convertFile();
