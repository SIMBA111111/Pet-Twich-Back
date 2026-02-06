// routes/videos.js
import express from 'express'
import  {createStream, getStreamsList, getStreamById, stopStreamById, getLiveStreamDuration, getStreamStatus, checkMyActiveStream } from '../controllers/streams-controller.js'
import {authenticateToken} from '../middleware/checkAutentication.js'

export const router = express.Router();

router.post('/streams/create', createStream);
router.get('/streams', authenticateToken, getStreamsList);
router.get('/streams/my', checkMyActiveStream);
router.get('/streams/:id', getStreamById);
router.get('/streams/stop/:id', stopStreamById);
router.get('/streams/time/:id/', getLiveStreamDuration);
router.get('/streams/status/:streamId', getStreamStatus);
// router.get('/streams/:streamId/message', addMessage);