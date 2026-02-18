import express from 'express'
import http from 'http'
import fs from 'fs'
import cookieParser from 'cookie-parser';
import path from 'path';
import cors from 'cors'
import {router as RouterStream} from './routes/routes-stream.js'
import {router as RouterAuth} from './routes/routes-auth.js'
import { activeStreams, sseClients} from './controllers/streams-controller.js'
import { WebSocketServer } from 'ws'
import { startFFmpegTranscoder } from './services/streams-service.js'
import { timeToSeconds } from './utils/timeToSeconds.js'
import { fileURLToPath } from 'url';
import { deleteViewerFromStream, getViewersCountByStreamId, getViewersListByStreamId, getStreamById, stopStreamById } from './repositories/streams-repository.js'

const activeChatWsConnections = new Map()
const activeViewersCountWsConnections = new Map()

const app = express();
export const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: '*', // URL фронтенда
  credentials: true // Важно! Разрешает передачу cookie
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/streams', express.static(path.join(__dirname, 'streams')));
app.use('/api', RouterStream)
app.use('/api/auth', RouterAuth)


const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
    
  // сокет для чата
  if (req.url.includes('/chat')) {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const arr = req.url.split('/');
    const streamId = arr[arr.length - 3]
    const username = req.url.split('/').pop()

    if(username && username != 'chat') {
      console.log(`Зритель ${username} подключился к сокету для отслеживания чата стрима ${streamId}`);

      if(!activeChatWsConnections.has(username)) {
        activeChatWsConnections.set(username, ws)
      } 
    } else {
      console.log(`Зритель ${clientIp} подключился к сокету для отслеживания чата стрима ${streamId}`);

      if(!activeChatWsConnections.has(clientIp)) {
        activeChatWsConnections.set(clientIp, ws)
      } 
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)

      if (data.type === "chatMessage") {

        const viewersList = await getViewersListByStreamId(streamId)

        for (let index = 0; index < viewersList.length; index++) {
          if(activeChatWsConnections.has(viewersList[index])) {
            const ws = activeChatWsConnections.get(viewersList[index])
            ws.send(JSON.stringify({type: 'chatMessage', message: data.message, senderUsername: data.senderUsername}))
          }          
        }
      }
    }

    ws.on('close', async () => {

      if(activeChatWsConnections.has(clientIp)) {
        activeChatWsConnections.delete(clientIp)
      }

      console.log(`Зритель ${clientIp} отключился от чата ${streamId}`);
    });

    return 
  }


  // сокет для получения количества зрителей
  if (req.url.includes('/streams/') && !req.url.includes('/chat')) {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    const arr = req.url.split('/');
    const username = arr[arr.length-2];
    const streamId = req.url.split('/').pop();

    if (username) {
      console.log(`Зритель ${username} подключился к сокету для отслеживания количества зрителей потока ${streamId}`);
      if(!activeViewersCountWsConnections.has(username)) {
        activeViewersCountWsConnections.set(username, ws)
      } 
    } else {
      console.log(`Зритель ${clientIp} подключился к сокету для отслеживания количества зрителей потока ${streamId}`);
      if(!activeViewersCountWsConnections.has(clientIp)) {
        activeViewersCountWsConnections.set(clientIp, ws)
      } 
    }

    const handleSendViewersCount = async () => {
      const viewersCount = await getViewersCountByStreamId(streamId)
      ws.send(JSON.stringify({type: 'viewersInfo', data: viewersCount}))
    }

    const intervalSendViewersCount = setInterval(handleSendViewersCount, 10000)


    ws.on('close', async (code, reason) => {
      clearInterval(intervalSendViewersCount)

      let username = ''
      
      if (Buffer.isBuffer(reason)) 
        username = reason.toString('utf8');
      else 
        username = reason

      if (username) {
        await deleteViewerFromStream(username, streamId)

        if(activeViewersCountWsConnections.has(username)) {
          activeViewersCountWsConnections.delete(username)
        }

        console.log(`Зритель ${username} отключился от стрима ${streamId}`);

      } else {
        await deleteViewerFromStream(clientIp, streamId)
        
        if(activeViewersCountWsConnections.has(clientIp)) {
          activeViewersCountWsConnections.delete(clientIp)
        }
        
        console.log(`Зритель ${clientIp} отключился от стрима ${streamId}`);
      }
    });

    return 
  }

  // сокет для передачи захваченного медиа контента стримером
  if(req.url.includes('/ws/')) {

    console.log('к сокету подключился стример с передачей медиа контента');

    const streamId = req.url.split('/').pop();
    const stream = await getStreamById(streamId);
    
    if (!stream) {
      ws.close(1008, 'Stream not found');
      return;
    }
    
    // Запускаем FFmpeg процесс для трансляции
    const ffmpegProcess = startFFmpegTranscoder(streamId, stream, sseClients);
    
    // Обработка входящих данных от клиента
    ws.on('message', (message) => {
      try {
        // Отправляем в FFmpeg
        if (ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.write(Buffer.from(message));
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', async () => {
      console.log(`WebSocket closed for stream: ${streamId}`);
      
      // Закрываем FFmpeg процесс
      if (ffmpegProcess && !ffmpegProcess.killed) {
        ffmpegProcess.stdin.end();
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎥 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 Доступен по адресам:`);
  console.log(`   - http://localhost:${PORT} (на этой же машине)`);
  console.log(`   - http://<IP-адрес-этой-машины>:${PORT} (из WSL или других устройств в сети)`);
});