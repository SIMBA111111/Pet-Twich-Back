import {pool} from '../utils/pg.js'

export const deleteViewerFromStream = async (clientIp, streamId) => {
    
    await pool.query(
        'UPDATE streams SET viewers = array_remove(viewers, $1) WHERE id = $2',
        [clientIp, streamId]
    );   
    console.log(`Client ${clientIp} removed from stream ${streamId}`);
}

export const getViewersCountByStreamId = async (streamId) => {
    const result = await pool.query(
        'SELECT COALESCE(array_length(viewers, 1), 0) as count FROM streams WHERE id = $1',
        [streamId]
    );
    return result.rows[0]?.count || 0;
};