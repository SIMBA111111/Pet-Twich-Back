import { spawn } from 'child_process';
import { timeToSeconds } from '../utils/timeToSeconds.js'
import fs from 'fs'
import path from 'path';
import { fileURLToPath } from 'url';

export function sendTimeUpdate(streamId, time, sseClients) {
  const clients = sseClients.get(streamId);
  if (clients) {
    for (const clientRes of clients) {
      clientRes.write(`data: ${JSON.stringify({ type: 'ffmpeg_time', time })}\n\n`);
    }
  }
}


// export function startFFmpegTranscoder(streamId, streamInfo, sseClients) {
//   console.log('streamInfo ===================== ', streamInfo);
//   const __filename = fileURLToPath(import.meta.url);
//   const __dir = path.dirname(__filename);
//   const currentDir = path.resolve(__dir, '..');
  
//   const playlistUrl = streamInfo.playlisturl;
//   const streamDir = path.join(currentDir, playlistUrl);
//   const playlistPath = path.join(streamDir, 'index.m3u8');
  
//   // Создаем начальный HLS плейлист, чтобы избежать 404
//   const initialPlaylist = `#EXTM3U
// #EXT-X-VERSION:3
// #EXT-X-TARGETDURATION:2
// #EXT-X-MEDIA-SEQUENCE:0
// #EXT-X-DISCONTINUITY
// #EXTINF:2.0,
// segment_000.ts
// #EXT-X-ENDLIST`;
  
//   fs.writeFileSync(playlistPath, initialPlaylist);
  
//   // Создаем пустой первый сегмент
//   const segmentPath = path.join(streamDir, 'segment_000.ts');
//   fs.writeFileSync(segmentPath, Buffer.from([]));
  
//   // Настройки качества
//   const qualitySettings = {
//     '480p': ['-vf', 'scale=854:480', '-b:v', '1500k'],
//     '720p': ['-vf', 'scale=1280:720', '-b:v', '2500k'],
//     '1080p': ['-vf', 'scale=1920:1080', '-b:v', '5000k']
//   };
  
//   const quality = qualitySettings['720p'];
  
//   // Аргументы FFmpeg для WebM -> HLS
//   const args = [
//     // Входные параметры (WebM с stdin)
//     '-i', 'pipe:0',
//     '-f', 'webm',
    
//     // Видео кодек
//     '-c:v', 'libx264',
//     '-preset', 'veryfast',
//     '-tune', 'zerolatency',
//     '-g', '60',
//     '-keyint_min', '60',
//     '-pix_fmt', 'yuv420p',
    
//     // Аудио кодек (WebM использует opus, конвертируем в aac для HLS)
//     '-c:a', 'aac',
//     '-b:a', '128k',
//     '-ar', '44100',
//     '-ac', '2',
    
//     // Качество
//     ...quality,
    
//     // HLS параметры
//     '-f', 'hls',
//     '-hls_time', '2', // Длина сегмента 2 секунды
//     '-hls_list_size', '10', // Хранить 5 сегментов в плейлисте
//     '-hls_flags', 'delete_segments+append_list',
//     '-hls_segment_filename', path.join(streamDir, 'segment_%03d.ts'),
//     '-hls_playlist_type', 'event',
    
//     // Выходной файл
//     playlistPath
//   ];
  
//   console.log('Starting FFmpeg with args:', args.join(' '));
  
//   try {
//     const ffmpegProcess = spawn('ffmpeg', args, {
//       stdio: ['pipe', 'pipe', 'pipe']
//     });
    
//     // Логирование вывода FFmpeg
//     ffmpegProcess.stderr.on('data', (data) => {
//       const output = data.toString();
//       const match = output.match(/time=([0-9:.]+)/);
      
//       if (match && match[1]) {
//         const currentTime = match[1];
//         const seconds = timeToSeconds(currentTime);
        
//         // console.log(`Время в секундах: ${seconds}`);
        
//         // Отправляем клиентам
//         sendTimeUpdate(streamId, seconds, sseClients);
//       }
//     });
    
//     ffmpegProcess.stdout.on('data', (data) => {
//       console.log(`FFmpeg stdout (${streamId}): ${data.toString()}`);
//     });
    
//     ffmpegProcess.on('close', (code) => {
//       console.log(`FFmpeg process exited with code ${code} for stream ${streamId}`);
      
//       // Создаем финальный плейлист
//       const finalPlaylist = `#EXTM3U
// #EXT-X-VERSION:3
// #EXT-X-TARGETDURATION:2
// #EXT-X-MEDIA-SEQUENCE:0
// #EXT-X-ENDLIST`;
      
//       fs.writeFileSync(playlistPath, finalPlaylist);
//     });
    
//     ffmpegProcess.on('error', (error) => {
//       console.error(`FFmpeg error for stream ${streamId}:`, error);
//     });
//     // console.log('ffmpegProcess = ', ffmpegProcess);
    
//     return ffmpegProcess;
//   } catch (error) {
//     console.error(`Failed to start FFmpeg for stream ${streamId}:`, error);
//     return null;
//   }
// }



export function startFFmpegTranscoder(streamId, streamInfo, sseClients) {
  // console.log('streamInfo ===================== ', streamInfo);
  // console.log('streamId ===================== ', streamId);
  const __filename = fileURLToPath(import.meta.url);
  const __dir = path.dirname(__filename);
  const currentDir = path.resolve(__dir, '..');
  
  const playlistUrl = streamInfo.playlisturl;
  const streamDir = path.join(currentDir, playlistUrl);
  const playlistPath = path.join(streamDir, 'index.m3u8');
  
  // Функция для очистки директории стрима
  const clearStreamDirectory = () => {
    try {
      // Проверяем, существует ли директория
      if (fs.existsSync(streamDir)) {
        console.log(`Очищаю директорию стрима: ${streamDir}`);
        
        // Получаем список файлов в директории
        const files = fs.readdirSync(streamDir);
        
        // Удаляем все файлы, кроме, возможно, некоторых системных
        files.forEach(file => {
          const filePath = path.join(streamDir, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`Удален файл: ${filePath}`);
          } catch (err) {
            console.warn(`Не удалось удалить файл ${filePath}:`, err.message);
          }
        });
        
        // Также можно удалить саму директорию и создать заново
        // fs.rmdirSync(streamDir, { recursive: true });
        // fs.mkdirSync(streamDir, { recursive: true });
      } else {
        // Создаем директорию, если она не существует
        fs.mkdirSync(streamDir, { recursive: true });
        console.log(`Создана директория для стрима: ${streamDir}`);
      }
    } catch (error) {
      console.error(`Ошибка при очистке директории ${streamDir}:`, error);
      // Продолжаем выполнение, возможно директория уже очищена
    }
  };
  
  // Функция для создания начальных файлов HLS
  const createInitialHLSFiles = () => {
    try {
      // Создаем начальный HLS плейлист
      const initialPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-DISCONTINUITY
#EXTINF:2.0,
segment_000.ts
#EXT-X-ENDLIST`;
      
      fs.writeFileSync(playlistPath, initialPlaylist);
      console.log(`Создан начальный плейлист: ${playlistPath}`);
      
      // Создаем пустой первый сегмент
      const segmentPath = path.join(streamDir, 'segment_000.ts');
      fs.writeFileSync(segmentPath, Buffer.from([]));
      console.log(`Создан начальный сегмент: ${segmentPath}`);
      
    } catch (error) {
      console.error(`Ошибка при создании начальных файлов HLS:`, error);
      throw error;
    }
  };
  
  // Очищаем директорию стрима
  clearStreamDirectory();
  
  // Создаем начальные файлы HLS
  createInitialHLSFiles();
  
  // Настройки качества
  const qualitySettings = {
    '480p': ['-vf', 'scale=854:480', '-b:v', '1500k'],
    '720p': ['-vf', 'scale=1280:720', '-b:v', '2500k'],
    '1080p': ['-vf', 'scale=1920:1080', '-b:v', '5000k']
  };
  
  const quality = qualitySettings['720p'];
  
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
    '-hls_list_size', '10', // Хранить 10 сегментов в плейлисте
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(streamDir, 'segment_%03d.ts'),
    '-hls_playlist_type', 'event',
    
    // Выходной файл
    playlistPath
  ];
  
  console.log(`Запускаю FFmpeg для стрима ${streamId} с аргументами:`, args.join(' '));
  
  try {
    const ffmpegProcess = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    
    // Логирование вывода FFmpeg
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Парсим время транскодирования
      const timeMatch = output.match(/time=([0-9:.]+)/);
      if (timeMatch && timeMatch[1]) {
        const currentTime = timeMatch[1];
        const seconds = timeToSeconds(currentTime);
        
        // Отправляем клиентам обновление времени
        sendTimeUpdate(streamId, seconds, sseClients);
      }
      
      // Логируем важные сообщения
      if (output.includes('Error') || output.includes('Failed') || output.includes('Invalid')) {
        console.error(`FFmpeg ошибка (${streamId}):`, output.trim());
      }
      
      // Логи прогресса
      if (output.includes('frame=') && output.includes('fps=')) {
        const frameMatch = output.match(/frame=\s*(\d+)/);
        const fpsMatch = output.match(/fps=\s*([\d.]+)/);
        const speedMatch = output.match(/speed=\s*([\d.]+)x/);
        
        if (frameMatch && fpsMatch) {
          console.log(`FFmpeg прогресс (${streamId}): кадров=${frameMatch[1]}, fps=${fpsMatch[1]}, скорость=${speedMatch ? speedMatch[1] : 'N/A'}x`);
        }
      }
    });
    
    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout (${streamId}):`, data.toString().trim());
    });
    
    // Обработка завершения процесса
    ffmpegProcess.on('close', (code, signal) => {
      console.log(`FFmpeg процесс для стрима ${streamId} завершен. Код: ${code}, Сигнал: ${signal}`);
      
      
      // Создаем финальный плейлист только если процесс завершился нормально
      if (code === 0) {
        const finalPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST`;
        
        try {
          fs.writeFileSync(playlistPath, finalPlaylist);
          console.log(`Создан финальный плейлист для стрима ${streamId}`);
        } catch (error) {
          console.error(`Ошибка при создании финального плейлиста:`, error);
        }
      }
    });
    
    ffmpegProcess.on('error', (error) => {
      console.error(`FFmpeg ошибка для стрима ${streamId}:`, error);
    });
    
    // Обработка сигналов для корректного завершения
    const handleExit = () => {
      console.log(`Получен сигнал завершения, останавливаю FFmpeg для стрима ${streamId}`);
      if (!ffmpegProcess.killed) {
        ffmpegProcess.kill('SIGTERM');
      }
    };
    
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    
    // Убираем обработчики при завершении процесса
    ffmpegProcess.on('close', () => {
      process.removeListener('SIGINT', handleExit);
      process.removeListener('SIGTERM', handleExit);
    });
    
    return ffmpegProcess;
    
  } catch (error) {
    console.error(`Не удалось запустить FFmpeg для стрима ${streamId}:`, error);
    
    return null;
  }
}

// // Вспомогательная функция для конвертации времени в секунды
// function timeToSeconds(timeStr) {
//   const parts = timeStr.split(':');
//   if (parts.length === 3) {
//     const hours = parseInt(parts[0], 10);
//     const minutes = parseInt(parts[1], 10);
//     const seconds = parseFloat(parts[2]);
//     return hours * 3600 + minutes * 60 + seconds;
//   } else if (parts.length === 2) {
//     const minutes = parseInt(parts[0], 10);
//     const seconds = parseFloat(parts[1]);
//     return minutes * 60 + seconds;
//   }
//   return parseFloat(timeStr) || 0;
// }