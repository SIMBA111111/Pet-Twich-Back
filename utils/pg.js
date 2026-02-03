// db.ts или db.js
import { Pool } from 'pg';

export const pool = new Pool({
  host: 'localhost',        // адрес сервера
  port: 5432,               // порт PostgreSQL
  database: 'streams', // имя вашей БД
  user: 'postgres',    // пользователь (обычно postgres или свой)
  password: 'postgres',// пароль
});