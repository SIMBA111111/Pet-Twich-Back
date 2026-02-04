import {pool} from '../utils/pg.js'

export const deleteViewerFromStream = async (clientIp, streamId) => {
    
    await pool.query(
        'UPDATE streams SET viewers = array_remove(viewers, $1) WHERE id = $2',
        [clientIp, streamId]
    );
    
    console.log(`Client ${clientIp} removed from stream ${streamId}`);
}