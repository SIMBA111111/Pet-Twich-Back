import {createUser, usernameIsExist, emailIsExist} from '../repositories/auth-repository.js'
import {cryptPassword, checkPassword, createToken} from '../services/auth-service.js'


export const login = async (req, res) => {
    if (req.method === 'POST') {
        const data = req.body

        const user = await usernameIsExist(data.username)
        if(!user)
            return res.json({result: `Юзера с username ${data.username} не существует`})

        const isAprovePassword = await checkPassword(data.password, user)

        if(!isAprovePassword) 
            return res.status(401).json({result: 'Неверный пароль'})

        const token = await createToken(user.id)

        res.cookie('userData', JSON.stringify({username: user.username, email: user.email, phoneNumber: user.phone_number}))
        res.cookie('userId', user.id, {
            httpOnly:  true,
            // secure: true // только для https
        })
        res.cookie('jwt', token.token, {
            httpOnly:  true,
            // secure: true // только для https
        })
        return res.status(201).json({ message: 'Авторизация успешна'})
    } else {
        res.status(405).json({ message: 'Method Not Allowed' })
    }
}


export const register = async (req, res) => {
    if (req.method === 'POST') {
        const data = req.body
        
        const user = await usernameIsExist(data.username)
        if(user)
            return res.json({result: `Username ${data.username} занят`})
        
        const email = await emailIsExist(data.email)
        if (email) 
            return res.json({result: `Email ${data.email} занят`})

        const hashedPassword = await cryptPassword(data.password)
        const createdUser = await createUser(data.fullname, data.username, hashedPassword, data.email, data.phoneNumber)

        res.status(201).json({ message: 'Успешно', result: createdUser })
    } else {
        res.status(405).json({ message: 'Method Not Allowed' })
    }
}

// export const CheckToken = async (req, res) => {
//     try {
//         if (req.method === 'POST') {
//             const data = req.body
            


//         } else {
//             res.status(405).json({ message: 'Method Not Allowed' })
//         }
//     } catch (error) {
//         throw new Error(`Error CheckToken controller: `, error)
//     }
// }