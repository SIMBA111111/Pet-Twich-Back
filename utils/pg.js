// db.ts или db.js
import { Pool } from 'pg';

export const pool = new Pool({
  host: 'localhost',        // адрес сервера
//   host: '10.255.255.254',        // адрес сервера
  port: 5432,               // порт PostgreSQL
  database: 'streams', // имя вашей БД
  user: 'postgres',    // пользователь (обычно postgres или свой)
  password: 'postgres',// пароль
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err.stack);
    } else {
        console.log('Connected to PostgreSQL successfully');
        release();
    }
});