import bcrypt from 'bcrypt';

export class PasswordService{
    async comparePassword(plainText:string,hashedPassword:string){
        return bcrypt.compare(plainText,hashedPassword);
    }
    async hashPassword(password:string){
        return bcrypt.hash(password,10);
    }
}

