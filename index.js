const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Папки для хранения данных
const STREAMS_DIR = path.join(__dirname, 'streams');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');

// Создаем директории
[STREAMS_DIR, RECORDINGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Хранилище активных стримов
const activeStreams = new Map();

// API Routes
app.post('/api/streams/create', (req, res) => {
  const { name, quality = '720p' } = req.body;
  const streamId = uuidv4();
  
  const streamDir = path.join(STREAMS_DIR, streamId);
  fs.mkdirSync(streamDir, { recursive: true });
  
  const streamInfo = {
    id: streamId,
    name: name || 'Прямой эфир',
    quality,
    status: 'created',
    createdAt: new Date().toISOString(),
    dir: streamDir,
    processes: [],
    viewers: 0,
    hlsUrl: `/streams/${streamId}/index.m3u8`
  };
  
  activeStreams.set(streamId, streamInfo);
  
  res.json({
    success: true,
    streamId,
    message: 'Трансляция создана',
    streamInfo
  });
});

app.get('/api/streams', (req, res) => {
  const streams = Array.from(activeStreams.values()).map(stream => ({
    id: stream.id,
    name: stream.name,
    status: stream.status,
    viewers: stream.viewers,
    createdAt: stream.createdAt,
    hlsUrl: stream.hlsUrl
  }));
  
  res.json({ streams });
});

app.get('/api/streams/:id', (req, res) => {
  const stream = activeStreams.get(req.params.id);
  
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  res.json(stream);
});

app.post('/api/streams/:id/stop', (req, res) => {
  const stream = activeStreams.get(req.params.id);
  
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  // Останавливаем все процессы FFmpeg
  stream.processes.forEach(process => {
    if (process && !process.killed) {
      process.kill('SIGKILL');
    }
  });
  
  stream.status = 'stopped';
  stream.endedAt = new Date().toISOString();
  
  res.json({ success: true, message: 'Stream stopped' });
});

// WebSocket сервер
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const streamId = req.url.split('/').pop();
  const stream = activeStreams.get(streamId);
  
  if (!stream) {
    ws.close(1008, 'Stream not found');
    return;
  }
  
  console.log(`WebSocket connected for stream: ${streamId}`);
  
  // Обновляем счетчик зрителей
  stream.viewers = (stream.viewers || 0) + 1;
  stream.status = 'live';
  
  // Создаем файл для записи входящих данных (для отладки)
  const inputFilePath = path.join(stream.dir, 'input.webm');
  const writeStream = fs.createWriteStream(inputFilePath);
  
  // Запускаем FFmpeg процесс для трансляции
  const ffmpegProcess = startFFmpegTranscoder(streamId, stream);
  stream.processes.push(ffmpegProcess);
  
  // Обработка входящих данных от клиента
  ws.on('message', (message) => {
    try {
      // Записываем для отладки
      writeStream.write(Buffer.from(message));
      
      // Отправляем в FFmpeg
      if (ffmpegProcess.stdin.writable) {
        ffmpegProcess.stdin.write(Buffer.from(message));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket closed for stream: ${streamId}`);
    
    // Закрываем FFmpeg процесс
    if (ffmpegProcess && !ffmpegProcess.killed) {
      ffmpegProcess.stdin.end();
    }
    
    // Закрываем файл записи
    writeStream.end();
    
    // Обновляем статус стрима
    if (stream) {
      stream.viewers = Math.max(0, stream.viewers - 1);
      if (stream.viewers === 0) {
        stream.status = 'ended';
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Функция запуска FFmpeg для трансляции
function startFFmpegTranscoder(streamId, streamInfo) {
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
    '-hls_time', '4', // Длина сегмента 2 секунды
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
      console.log(`FFmpeg (${streamId}): ${output}`);
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
    
    return ffmpegProcess;
  } catch (error) {
    console.error(`Failed to start FFmpeg for stream ${streamId}:`, error);
    return null;
  }
}

// Раздача статических файлов HLS
app.use('/streams/:streamId', (req, res, next) => {
  const streamId = req.params.streamId;
  const filePath = path.join(STREAMS_DIR, streamId, req.path);
  
  // Проверяем существование файла
  if (fs.existsSync(filePath)) {
    // Устанавливаем правильные заголовки
    if (req.path.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (req.path.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/MP2T');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Отдаем файл
    res.sendFile(filePath);
  } else {
    // Если файл не найден, создаем пустой для .m3u8
    if (req.path === '/index.m3u8') {
      const initialPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-ENDLIST`;
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(initialPlaylist);
    } else {
      res.status(404).send('Not Found');
    }
  }
});

// Простой эндпоинт для проверки доступности стрима
app.get('/streams/:streamId/status', (req, res) => {
  const streamId = req.params.streamId;
  const stream = activeStreams.get(streamId);
  
  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }
  
  res.json({
    status: stream.status,
    viewers: stream.viewers,
    createdAt: stream.createdAt,
    hlsUrl: stream.hlsUrl
  });
});

// Страница просмотра для зрителей
app.get('/viewer/:streamId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Очистка старых стримов
setInterval(() => {
  const now = Date.now();
  const oneHour = 2 * 60 * 1000;
  
  activeStreams.forEach((stream, streamId) => {
    if (stream.endedAt && (now - new Date(stream.endedAt).getTime()) > oneHour) {
      // Удаляем файлы стрима
      const streamDir = path.join(STREAMS_DIR, streamId);
      if (fs.existsSync(streamDir)) {
        fs.rmSync(streamDir, { recursive: true, force: true });
      }
      
      activeStreams.delete(streamId);
      console.log(`Cleaned up old stream: ${streamId}`);
    }
  });
}, 2 * 60 * 1000); // Каждые 30 минут

// Запуск сервера
server.listen(PORT, () => {
  console.log(`🎥 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Откройте http://localhost:${PORT} в браузере`);
  console.log(`📁 Папка стримов: ${STREAMS_DIR}`);
});