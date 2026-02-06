import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import {createTokenRepo} from '../repositories/auth-repository.js'

const SECRET_KEY = 'klsfjgdnkjlSDHBKjgfbskjdhfbksdbf'


export const cryptPassword = async (password) => {
  try {
    const saltRounds = 10; // число итераций соли
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    throw new Error (`Error cryptPassword: ${error}`)    
  }
}

export const checkPassword = async (password, user) => {
  try {
    const isMatch = await bcrypt.compare(password, user.password)
    return isMatch
  } catch (error) {
    throw new Error(`Error checkPassword: ${error}`)
  }
}

export const createToken = async (userId) => {
  try {
    const token = jwt.sign({ id: userId }, SECRET_KEY, { expiresIn: '12h' })

    const res = await createTokenRepo(userId, token)
    
    return res
  } catch (error) {
    throw new Error(`Error creating token: ${error}`);
  }
}

export const checkToken = async (token, userId) => {
  try {
    const isMatch = await bcrypt.compare(password, user.password)
    return isMatch
  } catch (error) {
    throw new Error(`Error checkPassword: ${error}`)
  }
}