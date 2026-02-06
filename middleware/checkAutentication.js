import jwt from 'jsonwebtoken';

const SECRET_KEY = 'klsfjgdnkjlSDHBKjgfbskjdhfbksdbf'

export const authenticateToken = (req, res, next) => {
    console.log('req.cookies = ', req.cookies);

    const token = req.cookies.jwt; // предполагая, что используешь cookie-parser

    if (!token) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // секрет должен храниться в переменной окружения
        req.userId = decoded.id; // или другое поле, которое ты закодировал
        next(); // переходим к следующему middleware или обработчику
    } catch (err) {
        return res.status(401).json({ message: 'Некорректный или просроченный токен' });
    }
};