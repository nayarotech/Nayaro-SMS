import { PrismaClient, UserRole, User } from "@prisma/client";
import prisma from "../../db/prisma";

/**
 * Find a user by ID and school ID
 */
export async function findByIdAndSchool(
  userId: number,
  schoolId: number
): Promise<User | null> {
  return prisma.user.findFirst({
    where: {
      id: userId,
      schoolId: schoolId,
    },
  });
}

/**
 * Find multiple users by school with optional filters
 */
export async function findManyBySchool(params: {
  schoolId: number;
  role?: UserRole;
  search?: string;
  skip: number;
  take: number;
}): Promise<User[]> {
  const { schoolId, role, search, skip, take } = params;

  const where: any = {
    schoolId: schoolId,
  };

  if (role) {
    where.role = role;
  }

  if (search) {
    where.OR = [
      {
        fullName: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.user.findMany({
    where,
    skip,
    take,
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Count users by school with optional filters
 */
export async function countBySchool(params: {
  schoolId: number;
  role?: UserRole;
  search?: string;
}): Promise<number> {
  const { schoolId, role, search } = params;

  const where: any = {
    schoolId: schoolId,
  };

  if (role) {
    where.role = role;
  }

  if (search) {
    where.OR = [
      {
        fullName: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.user.count({ where });
}

/**
 * Create a new user
 */
export async function createUser(data: {
  schoolId: number;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}): Promise<User> {
  return prisma.user.create({
    data,
  });
}

/**
 * Update a user by ID and school ID
 */
export async function updateUserByIdAndSchool(
  userId: number,
  schoolId: number,
  data: Partial<{
    fullName: string;
    role: UserRole;
    isActive: boolean;
  }>
): Promise<User> {
  return prisma.user.update({
    where: {
      id: userId,
      schoolId: schoolId,
    },
    data,
  });
}

/**
 * Find a user by email
 */
export async function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      email,
    },
  });
}

/**
 * Find a user by ID
 */
export async function findById(userId: number): Promise<User | null> {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
}

/**
 * Update a user by ID (for self-profile updates)
 */
export async function updateUserById(
  userId: number,
  data: Partial<{
    fullName: string;
  }>
): Promise<User> {
  return prisma.user.update({
    where: {
      id: userId,
    },
    data,
  });
}

