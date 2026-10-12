import { IAuthRepository } from "./auth.interface.ts";


export class AuthRepository implements IAuthRepository{
    async findByEmail(email: string): Promise<User> | null {
        return prisma.user.findUnique({
            where:{
                email
            }
        })
    }

    async createUser(userData: CreateUserDTO): Promise<User> {
        return prisma.user.create({
            data: userData
        })
    }
}

