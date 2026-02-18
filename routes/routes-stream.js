// routes/videos.js
import express from 'express'
import  {createStream, getStreamsList, getStreamById, stopStreamById, getLiveStreamDuration, getStreamStatus, checkMyActiveStream } from '../controllers/streams-controller.js'
import { startStream, getKeyStream, createKeyStream } from '../controllers/obs-stream-controller.js'
import {authenticateToken} from '../middleware/checkAutentication.js'

export const router = express.Router();

// новый роутинг для OBS
router.post('/streams/start', startStream);
router.post('/streams/key-stream/create', createKeyStream);
router.get('/streams/key-stream/get', getKeyStream);



// Старый роутинг
// router.post('/streams/create', createStream);
// router.get('/streams', authenticateToken, getStreamsList);
router.get('/streams', getStreamsList);
// router.get('/streams/my', checkMyActiveStream);
router.post('/streams/:id', getStreamById);
// router.get('/streams/stop/:id', stopStreamById);
// router.get('/streams/time/:id/', getLiveStreamDuration);
// router.get('/streams/status/:streamId', getStreamStatus);
// router.get('/streams/:streamId/message', addMessage);


