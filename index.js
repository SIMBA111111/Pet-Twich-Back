import express from 'express'
import http from 'http'
import fs from 'fs'
import path from 'path';
import cors from 'cors'
import {router as RouterStream} from './routes/routes-stream.js'
import { activeStreams, sseClients} from './controllers/streams-controller.js'
import { WebSocketServer } from 'ws'
import { startFFmpegTranscoder } from './services/streams-service.js'
import { timeToSeconds } from './utils/timeToSeconds.js'
import { fileURLToPath } from 'url';


const app = express();
export const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/streams', express.static(path.join(__dirname, 'streams')));
app.use('/api', RouterStream)


const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('ws connect');
    
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
  const ffmpegProcess = startFFmpegTranscoder(streamId, stream, sseClients);
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

// Очистка старых стримов
// setInterval(() => {
//   const now = Date.now();
//   const oneHour = 2 * 60 * 1000;
  
//   activeStreams.forEach((stream, streamId) => {
//     if (stream.endedAt && (now - new Date(stream.endedAt).getTime()) > oneHour) {
//       // Удаляем файлы стрима
//       const streamDir = path.join(STREAMS_DIR, streamId);
//       if (fs.existsSync(streamDir)) {
//         fs.rmSync(streamDir, { recursive: true, force: true });
//       }
      
//       activeStreams.delete(streamId);
//       console.log(`Cleaned up old stream: ${streamId}`);
//     }
//   });
// }, 2 * 60 * 1000); // Каждые 30 минут

// Запуск сервера
server.listen(PORT, () => {
  console.log(`🎥 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Откройте http://localhost:${PORT} в браузере`);
  // console.log(`📁 Папка стримов: ${STREAMS_DIR}`);
});