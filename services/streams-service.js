import { spawn } from 'child_process';
import { timeToSeconds } from '../utils/timeToSeconds.js'
import fs from 'fs'
import path from 'path';

export function sendTimeUpdate(streamId, time, sseClients) {
  const clients = sseClients.get(streamId);
  if (clients) {
    for (const clientRes of clients) {
      clientRes.write(`data: ${JSON.stringify({ type: 'ffmpeg_time', time })}\n\n`);
    }
  }
}


export function startFFmpegTranscoder(streamId, streamInfo, sseClients) {
  const streamDir = streamInfo.dir;
  const playlistPath = path.join(streamDir, 'index.m3u8');
  
  // Создаем начальный HLS плейлист, чтобы избежать 404
  const initialPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DISCONTINUITY
#EXTINF:2.0,
segment_000.ts
#EXT-X-ENDLIST`;
  
  fs.writeFileSync(playlistPath, initialPlaylist);
  
  // Создаем пустой первый сегмент
  const segmentPath = path.join(streamDir, 'segment_000.ts');
  fs.writeFileSync(segmentPath, Buffer.from([]));
  
  // Настройки качества
  const qualitySettings = {
    '480p': ['-vf', 'scale=854:480', '-b:v', '1500k'],
    '720p': ['-vf', 'scale=1280:720', '-b:v', '2500k'],
    '1080p': ['-vf', 'scale=1920:1080', '-b:v', '5000k']
  };
  
  const quality = qualitySettings[streamInfo.quality] || qualitySettings['720p'];
  
  // Аргументы FFmpeg для WebM -> HLS
  const args = [
    // Входные параметры (WebM с stdin)
    '-i', 'pipe:0',
    '-f', 'webm',
    
    // Видео кодек
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-g', '60',
    '-keyint_min', '60',
    '-pix_fmt', 'yuv420p',
    
    // Аудио кодек (WebM использует opus, конвертируем в aac для HLS)
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    
    // Качество
    ...quality,
    
    // HLS параметры
    '-f', 'hls',
    '-hls_time', '2', // Длина сегмента 2 секунды
    '-hls_list_size', '10', // Хранить 5 сегментов в плейлисте
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(streamDir, 'segment_%03d.ts'),
    '-hls_playlist_type', 'event',
    
    // Выходной файл
    playlistPath
  ];
  
  console.log('Starting FFmpeg with args:', args.join(' '));
  
  try {
    const ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Логирование вывода FFmpeg
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/time=([0-9:.]+)/);
      
      if (match && match[1]) {
        const currentTime = match[1];
        const seconds = timeToSeconds(currentTime);
        
        // console.log(`Время в секундах: ${seconds}`);
        
        // Отправляем клиентам
        sendTimeUpdate(streamId, seconds, sseClients);
      }
    });
    
    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout (${streamId}): ${data.toString()}`);
    });
    
    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code} for stream ${streamId}`);
      streamInfo.status = 'ended';
      
      // Создаем финальный плейлист
      const finalPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST`;
      
      fs.writeFileSync(playlistPath, finalPlaylist);
    });
    
    ffmpegProcess.on('error', (error) => {
      console.error(`FFmpeg error for stream ${streamId}:`, error);
      streamInfo.status = 'error';
    });
    // console.log('ffmpegProcess = ', ffmpegProcess);
    
    return ffmpegProcess;
  } catch (error) {
    console.error(`Failed to start FFmpeg for stream ${streamId}:`, error);
    return null;
  }
}