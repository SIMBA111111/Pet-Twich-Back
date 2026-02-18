import {pool} from '../utils/pg.js'


export const createKeyStreamRepo = async (streamKey, userId) => {
    try {
        const res = await pool.query('INSERT INTO streamskeys ("key", userid) VALUES ($1, $2) RETURNING "key"', [streamKey, userId])
        return res.rows[0].key
    } catch (error) {
        new Error('Error in createKeyStreamRepo: ', error)
        console.log(error);
    }
}