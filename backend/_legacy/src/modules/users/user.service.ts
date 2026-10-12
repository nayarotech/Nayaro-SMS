import { UserRole, User } from "@prisma/client";
import * as userRepository from "./user.repository";
import { hashPassword } from "../../../utils/password";

/**
 * Type for user DTO (without passwordHash)
 */
export type UserDto = Omit<User, "passwordHash">;

/**
 * Pagination result type
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * Convert User to UserDto (exclude passwordHash)
 */
function toUserDto(user: User): UserDto {
  const { passwordHash, ...userDto } = user;
  return userDto;
}

/**
 * List users for a school with pagination and filters
 */
export async function listUsersForSchool(
  schoolId: number,
  options: {
    role?: UserRole;
    search?: string;
    page?: number;
    limit?: number;
  }
): Promise<PaginatedResult<UserDto>> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const limit = options.limit && options.limit > 0 ? options.limit : 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    userRepository.findManyBySchool({
      schoolId,
      role: options.role,
      search: options.search,
      skip,
      take: limit,
    }),
    userRepository.countBySchool({
      schoolId,
      role: options.role,
      search: options.search,
    }),
  ]);

  return {
    data: users.map(toUserDto),
    pagination: {
      page,
      limit,
      total,
    },
  };
}

/**
 * Get a single user for a school
 */
export async function getUserForSchool(
  schoolId: number,
  userId: number
): Promise<UserDto> {
  const user = await userRepository.findByIdAndSchool(userId, schoolId);

  if (!user) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  return toUserDto(user);
}

/**
 * Create a new user for a school
 */
export async function createUserForSchool(params: {
  schoolId: number;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<UserDto> {
  // Check if email already exists
  const existingUser = await userRepository.findByEmail(params.email);
  if (existingUser) {
    const error: any = new Error("Email already exists");
    error.status = 409;
    throw error;
  }

  // Hash password
  const passwordHash = await hashPassword(params.password);

  // Create user
  const user = await userRepository.createUser({
    schoolId: params.schoolId,
    fullName: params.fullName,
    email: params.email,
    passwordHash,
    role: params.role,
  });

  return toUserDto(user);
}

/**
 * Update a user for a school
 */
export async function updateUserForSchool(
  schoolId: number,
  userId: number,
  data: {
    fullName?: string;
    role?: UserRole;
    isActive?: boolean;
  }
): Promise<UserDto> {
  // Verify user exists and belongs to school
  const existingUser = await userRepository.findByIdAndSchool(userId, schoolId);
  if (!existingUser) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  // Update user
  const user = await userRepository.updateUserByIdAndSchool(userId, schoolId, data);

  return toUserDto(user);
}

/**
 * Deactivate a user for a school
 */
export async function deactivateUserForSchool(
  schoolId: number,
  userId: number
): Promise<UserDto> {
  // Verify user exists and belongs to school
  const existingUser = await userRepository.findByIdAndSchool(userId, schoolId);
  if (!existingUser) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  // Deactivate user
  const user = await userRepository.updateUserByIdAndSchool(userId, schoolId, {
    isActive: false,
  });

  return toUserDto(user);
}

/**
 * Get own profile
 */
export async function getOwnProfile(userId: number): Promise<UserDto> {
  const user = await userRepository.findById(userId);

  if (!user) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  return toUserDto(user);
}

/**
 * Update own profile (name only)
 */
export async function updateOwnProfile(
  userId: number,
  data: { fullName: string }
): Promise<UserDto> {
  // Verify user exists
  const existingUser = await userRepository.findById(userId);
  if (!existingUser) {
    const error: any = new Error("User not found");
    error.status = 404;
    throw error;
  }

  // Update user
  const user = await userRepository.updateUserById(userId, {
    fullName: data.fullName,
  });

  return toUserDto(user);
}

