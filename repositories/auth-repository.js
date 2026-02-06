import {pool} from '../utils/pg.js'

export const usernameIsExist = async (username) => {
    try {
        const res = await pool.query('SELECT * FROM users WHERE username=$1', [username])
        if (res.rows[0]) 
            return res.rows[0]

        return false
    } catch (error) {
        throw new Error(`Error usernameIsExist repository: ${error}`)
    }
}

export const emailIsExist = async (email) => {
    try {
        const res = await pool.query('SELECT * FROM users WHERE email=$1', [email])
        if (res.rows[0]) 
            return res.rows[0]

        return false
    } catch (error) {
        throw new Error(`Error emailIsExist repository: ${error}`)
    }
}

export const createUser = async (fullname, username, hashedPassword, email, phoneNumber) => {
    try {
        const res = await pool.query('INSERT INTO users (fullname, username, password, email, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [fullname, username, hashedPassword, email, phoneNumber]
        )
        const createdUser = res.rows[0]
        return createdUser 
    } catch (error) {
        throw new Error(`Error createUser: ${error}`)
    }
}

export const createTokenRepo = async (userId, token) => {
    try {
        const res = await pool.query('INSERT INTO tokens (userid, token) VALUES ($1, $2) RETURNING *',
            [userId, token]
        )
        const createdToken = res.rows[0]
        return createdToken
    } catch (error) {
        throw new Error(`Error createToken: ${error}`)
    }
}