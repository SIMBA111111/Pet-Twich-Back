import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs'
import {pool} from '../utils/pg.js'
import { stopStreamById as stopStreamByIdRepo } from '../repositories/streams-repository.js';
import { getStreamById as getStreamByIdRepo } from '../repositories/streams-repository.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Переход на директорию выше
const parentDir = path.resolve(__dirname, '..');

// Пути для хранения данных в директории выше
const STREAMS_DIR = path.join(parentDir, 'streams');
const RECORDINGS_DIR = path.join(parentDir, 'recordings');

// Создаем директории
[parentDir, STREAMS_DIR, RECORDINGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export const activeStreams = new Map();
export const sseClients = new Map(); // карта для хранения соединений по streamId


export const createStream = async (req, res) => {
  const { name, quality = '720p' } = req.body;
  const streamId = uuidv4();
  const ownerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  
  const data = await pool.query('INSERT INTO streams (id, title, isLive, "owner", playlisturl) VALUES ($1, $2, $3, $4, $5) RETURNING *', [streamId, name, true, ownerIp, `/streams/${streamId}`])
  const createdStream = data.rows[0]

  const streamDir = path.join(STREAMS_DIR, createdStream.id);
  fs.mkdirSync(streamDir, { recursive: true });

  // console.log('createdStream = ', createdStream);


  res.json({
    success: true,
    streamId,
    message: 'Трансляция создана',
    createdStream    
  });
}


export const getStreamsList = async (req, res) => {
    try {
        const streams = await pool.query(
            `SELECT 
                streams.id,
                streams.title,
                streams.islive,
                streams.owner_id,
                streams.stream_key_id,
                users.id as streamer_id,
                users.username as streamer_name,
                streamskeys.key as stream_key
             FROM streams
             JOIN users ON streams.owner_id = users.id
             JOIN streamskeys ON streams.stream_key_id = streamskeys.id
             WHERE streams.islive = true
            `
        );

        // Форматируем длительность для удобства
        const formattedStreams = streams.rows.map(stream => ({
            id: stream.id,
            title: stream.title,
            isLive: stream.islive,
            ownerId: stream.owner,
            streamerId: stream.streamer_id,
            streamerName: stream.streamer_name,
            streamerAvatar: stream.streamer_avatar,
            // streamKey: stream.stream_key,
            streamHlsPath: `/hls/${stream.stream_key}/index.m3u8`,
            // keyCreatedAt: stream.key_created_at,
            // viewersCount: parseInt(stream.viewers_count) || 0,
            // previewUrl: `/api/streams/${stream.id}/preview`
        }));

        res.status(200).json({
            success: true,
            count: formattedStreams.length,
            streams: formattedStreams
        });

    } catch (error) {
        console.error('Error in getStreamsList:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        });
    }
}


export const getStreamById = async (req, res) => {
  // if(req.body) {  }
  console.log('getStreamById');
  
  let clientIdentificator = ''

  if(req.body.username) {
    clientIdentificator = req.body.username
  } else {
    clientIdentificator = req.headers?.['x-forwarded-for'] || req.connection.remoteAddress;
  }
  
  const streamId = req.params.id;
  
  try {
    // Сначала проверим, существует ли стрим
    const checkResult = await pool.query(
      `SELECT
        streams.id,
        streams.viewers,
        streams.title,
        streams.islive,
        streams.owner_id,
        streams.stream_key_id,
        users.id as streamer_id,
        users.username as streamer_name,
        streamskeys.key as stream_key
      FROM streams
      JOIN users ON streams.owner_id = users.id
      JOIN streamskeys ON streams.stream_key_id = streamskeys.id
      WHERE streams.islive = true AND streams.id = $1 
      `,
      [streamId]
    );

    if (checkResult.rows.length === 0) {
      console.log('Стрим не найден');
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Выполняем обновление
    const updateResult = await pool.query(
      `UPDATE streams
      SET viewers = array_append(viewers, $1::text)
      WHERE id = $2 
      AND NOT ($1::text = ANY(viewers))
      RETURNING id, viewers, title, playlisturl`,
      [clientIdentificator, streamId]
    );

    console.log('checkResult.rows[0] ==== ', checkResult.rows[0]);
    
    
    res.json({data: checkResult.rows[0]});
    
  } catch (error) {
    console.error('Error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


export const stopStreamById = async (req, res) => {
  const streamId = req.params.id
  const stream = await getStreamByIdRepo(streamId)

  if (!stream) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  const result = await stopStreamByIdRepo(streamId)

  // console.log('stopStreamById res = ', result);
  

  res.json({ success: true, message: `Stream ${result} stopped` });
}


export const getLiveStreamDuration = async (req, res) => {
  const streamId = req.params.id;

  // Настраиваем headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Добавляем клиента в карту
  if (!sseClients.has(streamId)) {
    sseClients.set(streamId, new Set());
  }
  sseClients.get(streamId).add(res);

  // Обработка закрытия соединения
  req.on('close', () => {
    sseClients.get(streamId).delete(res);
    if (sseClients.get(streamId).size === 0) {
      sseClients.delete(streamId);
    }
  });
}


export const getStreamStatus = async (req, res) => {
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
}

export const checkMyActiveStream = async (req, res) => {
  const ownerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  const isExistMyStream = await pool.query('SELECT * FROM streams WHERE "owner"=$1 AND isLive=true', [ownerIp])

  if(!isExistMyStream.rows[0]) {
    return res.status(404).json('empty')
  }

  return res.status(200).json({notStopedStream: isExistMyStream.rows[0]})
}


// export const addMessage = async (req, res) => {
//   const streamId = req.params.streamId

//   const stream = await pool.query(
//       'SELECT id FROM streams WHERE id = $1',
//       [streamId]
//     );



// }