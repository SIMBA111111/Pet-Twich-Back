// routes/videos.js
import express from 'express'
import  {createStream, getStreamsList, getStreamById, stopStreamById, getLiveStreamDuration, getStreamStatus } from '../controllers/streams-controller.js'

export const router = express.Router();

router.post('/streams/create', createStream);
router.get('/streams', getStreamsList);
router.get('/streams/:id', getStreamById);
router.get('/streams/:id/stop', stopStreamById);
router.get('/streams/:id/time', getLiveStreamDuration);
router.get('/streams/:streamId/status', getStreamStatus);
// router.get('/streams/:streamId/message', addMessage);