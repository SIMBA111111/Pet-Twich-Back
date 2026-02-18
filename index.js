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
  origin: ['http://localhost:3000', 'http://localhost:3001'], // URL фронтенда
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

    console.log(`🔌 Новое подключение к чату: streamId=${streamId}, username=${username || clientIp}`);

    if(username && username != 'chat') {
      console.log(`👤 Зритель ${username} подключился к сокету для отслеживания чата стрима ${streamId}`);

      if(!activeChatWsConnections.has(username)) {
        activeChatWsConnections.set(username, ws)
      } else {
        // Если уже есть соединение с таким username, заменяем его
        activeChatWsConnections.set(username, ws)
      }
    } else {
      console.log(`🖥️ Зритель ${clientIp} подключился к сокету для отслеживания чата стрима ${streamId}`);

      if(!activeChatWsConnections.has(clientIp)) {
        activeChatWsConnections.set(clientIp, ws)
      } else {
        activeChatWsConnections.set(clientIp, ws)
      }
    }

    // Отправляем подтверждение подключения
    ws.send(JSON.stringify({ 
      type: 'connection', 
      status: 'connected',
      message: 'Вы подключены к чату' 
    }));

    ws.on('message', async (data) => {
      try {
        // Проверяем, что данные - это строка
        if (typeof data !== 'string') {
          // Если это Buffer, конвертируем в строку
          data = data.toString();
        }
        
        // Проверяем, что данные не пустые
        if (!data || data.trim() === '') {
          console.log('⚠️ Получено пустое сообщение');
          return;
        }

        console.log('📨 Получены сырые данные:', data);
        
        const parsedData = JSON.parse(data);
        console.log('📨 Получено сообщение от клиента:', parsedData);

        if (parsedData.type === "chatMessage") {
          console.log(`💬 Сообщение от ${parsedData.senderUsername}: ${parsedData.message}`);

          // Получаем список зрителей
          const viewersList = await getViewersListByStreamId(streamId)
          console.log('👥 Список зрителей:', viewersList);

          // Отправляем сообщение ВСЕМ зрителям, включая отправителя
          for (let index = 0; index < viewersList.length; index++) {
            const viewer = viewersList[index];
            
            // Проверяем оба варианта ключей - и username, и clientIp
            let wsConnection = activeChatWsConnections.get(viewer);
            
            // Если не нашли по username, пробуем найти по clientIp
            if (!wsConnection) {
              // Проходим по всем соединениям в поисках нужного viewer
              for (let [key, value] of activeChatWsConnections.entries()) {
                if (key === viewer || value === viewer) {
                  wsConnection = value;
                  break;
                }
              }
            }

            if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
              const messageToSend = JSON.stringify({
                type: 'chatMessage',
                message: parsedData.message,
                senderUsername: parsedData.senderUsername
              });
              
              console.log(`📤 Отправка сообщения зрителю ${viewer}`);
              wsConnection.send(messageToSend);
            } else {
              console.log(`⚠️ Соединение с зрителем ${viewer} не активно или не найдено`);
            }
          }

          // Также отправляем сообщение всем анонимным зрителям (по clientIp)
          let anonymousSent = 0;
          activeChatWsConnections.forEach((connection, key) => {
            // Если ключ не в viewersList и это не username (содержит точки или двоеточия как IP)
            if (!viewersList.includes(key) && (key.includes('.') || key.includes(':'))) {
              if (connection.readyState === WebSocket.OPEN) {
                const messageToSend = JSON.stringify({
                  type: 'chatMessage',
                  message: parsedData.message,
                  senderUsername: parsedData.senderUsername
                });
                console.log(`📤 Отправка сообщения анонимному зрителю ${key}`);
                connection.send(messageToSend);
                anonymousSent++;
              }
            }
          });
          
          console.log(`📊 Итого отправлено: ${viewersList.length} зарегистрированным + ${anonymousSent} анонимным`);
        }
      } catch (error) {
        console.error('❌ Ошибка обработки сообщения:', error);
        console.error('Проблемные данные:', data);
      }
    });

    ws.on('close', async () => {
      console.log(`🔌 Зритель ${clientIp} отключился от чата ${streamId}`);

      // Удаляем из активных соединений
      if (username && username != 'chat') {
        if (activeChatWsConnections.has(username)) {
          activeChatWsConnections.delete(username)
        }
      } else {
        if (activeChatWsConnections.has(clientIp)) {
          activeChatWsConnections.delete(clientIp)
        }
      }
      
      console.log(`📊 Осталось активных чат соединений: ${activeChatWsConnections.size}`);
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket ошибка в чате:', error);
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