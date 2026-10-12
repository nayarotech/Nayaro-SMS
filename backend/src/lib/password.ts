import bcrypt from "bcrypt";

const ROUNDS = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
