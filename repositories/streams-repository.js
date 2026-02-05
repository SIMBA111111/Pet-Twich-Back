import {pool} from '../utils/pg.js'

export const deleteViewerFromStream = async (clientIp, streamId) => {
    console.log('streamId: ', streamId);
    try {
        await pool.query(
            'UPDATE streams SET viewers = array_remove(viewers, $1) WHERE id = $2',
            [clientIp, streamId]
        );   
        console.log(`Client ${clientIp} removed from stream ${streamId}`);
    } catch (error) {
        console.error('Error deleteViewerFromStream repository: ', error);
    }
}

export const getViewersCountByStreamId = async (streamId) => {
    console.log('getViewersCountByStreamId streamId: ', streamId);
    try {
        const result = await pool.query(
            'SELECT COALESCE(array_length(viewers, 1), 0) as count FROM streams WHERE id = $1',
            [streamId]
        );
        return result.rows[0]?.count || 0;
        
    } catch (error) {
        console.error('Error getViewersCountByStreamId repository: ', error);
    }
};

export const getViewersListByStreamId = async (streamId) => {
    console.log('getViewersListByStreamId streamId: ', streamId);
    try {
        const result = await pool.query(
            'SELECT COALESCE(viewers, ARRAY[]::text[]) as viewers_list FROM streams WHERE id = $1',
            [streamId]
        );
        return result.rows[0]?.viewers_list || [];
    } catch (error) {
        console.error('Error getViewersListByStreamId repository: ', error);
    }    
};

export const getStreamById = async (streamId) => {
    if (!streamId)
        return []
    
    try {
        const result = await pool.query(
            'SELECT * FROM streams WHERE id = $1',
            [streamId]
        );
        return result.rows[0]
    } catch (error) {
        console.error('Error getStreamById repository: ', error);
    }
};

export const stopStreamById = async (streamId) => {
    if (!streamId)
        return 'Stream not found' 

    try {
        const result = await pool.query(
            'UPDATE streams SET islive = false WHERE id = $1 RETURNING *',
            [streamId]
        );
        return result.rows[0].id
    } catch (error) {
        console.eror('stopStreamById repository: ', error);
                
    }
};