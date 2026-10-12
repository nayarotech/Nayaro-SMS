

export interface IAuthRepository{
    findByEmail(email: string): Promise<User> | null;
    createUser(userData:CreateUserDTO): Promise<User>;


}
