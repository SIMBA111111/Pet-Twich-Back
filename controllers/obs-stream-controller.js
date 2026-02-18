import crypto from 'crypto';

import {createKeyStreamRepo} from '../repositories/obs-stream-repository.js'
import { pool } from '../utils/pg.js';

export const startStream = async (req, res) => {
    console.log('Stream key received:', req.body.name);
    console.log('Client IP:', req.body.addr);
    console.log('Full request body:', req.body);

    const streamKey = req.body.name;

    try {
        // ИСПРАВЛЕНО: Правильный JOIN синтаксис
        const currentUser = await pool.query(
            `SELECT users.id, users.username
             FROM streamskeys
             JOIN users ON streamskeys.userid = users.id
             WHERE streamskeys.key = $1`,
            [streamKey]
        );

        console.log('currentUser.rows[0] = ', currentUser.rows[0]);

        // Проверка, нашелся ли пользователь
        if (!currentUser.rows[0]) {
            return res.status(404).send('Stream key not found');
        }

        const streamerId = currentUser.rows[0].id;

        const streamKeyId = await pool.query(
            `SELECT id
             FROM streamskeys
             WHERE key = $1`,
            [streamKey]
        );

        const data = await pool.query(
            `INSERT INTO streams (title, islive, owner_id, stream_key_id) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            ['testname', true, streamerId, streamKeyId.rows[0].id]
        );
        
        const createdStream = data.rows[0];
        console.log('createdStream = ', createdStream);
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Error in startStream:', error);
        res.status(500).send('Internal Server Error');
    }
}

export const createKeyStream = async (req, res) => {
    const userId = req.headers['x-forwarded-for'] || req.connection.remoteAddress

    const key = crypto.randomBytes(16).toString('hex');

    const newStreamKey = await createKeyStreamRepo(key, '33f6742b-65b3-45c0-8ccf-8f8b213e58ce')
    
    res.status(200).json({newStreamKey: newStreamKey})
}

export const getKeyStream = async (req, res) => {
    console.log('getKeyStream');
    
    res.status(200).json({streamKey: 'zxzx'})
}

// export const getKeyStream = async (req, res) => {
//     console.log('getKeyStream');
    
//     res.status(200).json({streamKey: 'zxzx'})
// }