import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import * as userService from "./user.service";

/**
 * Extended Express Request with user from auth middleware
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    schoolId: number;
  };
}

/**
 * List users (ADMIN only)
 */
export async function listUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.user!.schoolId;
    const role = req.query.role as UserRole | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page
      ? parseInt(req.query.page as string, 10)
      : undefined;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : undefined;

    const result = await userService.listUsersForSchool(schoolId, {
      role,
      search,
      page,
      limit,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Get user by ID (ADMIN only)
 */
export async function getUserById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.user!.schoolId;
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      const error: any = new Error("Invalid user ID");
      error.status = 400;
      return next(error);
    }

    const user = await userService.getUserForSchool(schoolId, userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * Create user (ADMIN only)
 */
export async function createUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.user!.schoolId;
    const { fullName, email, password, role } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !role) {
      const error: any = new Error("Missing required fields");
      error.status = 400;
      return next(error);
    }

    // Validate role
    const validRoles: UserRole[] = ["ADMIN", "TEACHER", "PARENT", "ACCOUNTANT"];
    if (!validRoles.includes(role)) {
      const error: any = new Error("Invalid role");
      error.status = 400;
      return next(error);
    }

    const user = await userService.createUserForSchool({
      schoolId,
      fullName,
      email,
      password,
      role,
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * Update user (ADMIN only)
 */
export async function updateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.user!.schoolId;
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      const error: any = new Error("Invalid user ID");
      error.status = 400;
      return next(error);
    }

    const { fullName, role, isActive } = req.body;

    // Validate role if provided
    if (role) {
      const validRoles: UserRole[] = ["ADMIN", "TEACHER", "PARENT", "ACCOUNTANT"];
      if (!validRoles.includes(role)) {
        const error: any = new Error("Invalid role");
        error.status = 400;
        return next(error);
      }
    }

    // Build update data (only include provided fields)
    const updateData: {
      fullName?: string;
      role?: UserRole;
      isActive?: boolean;
    } = {};

    if (fullName !== undefined) updateData.fullName = fullName;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if at least one field is provided
    if (Object.keys(updateData).length === 0) {
      const error: any = new Error("No fields to update");
      error.status = 400;
      return next(error);
    }

    const user = await userService.updateUserForSchool(schoolId, userId, updateData);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * Delete/Deactivate user (ADMIN only)
 */
export async function deleteUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.user!.schoolId;
    const userId = parseInt(req.params.id, 10);

    if (isNaN(userId)) {
      const error: any = new Error("Invalid user ID");
      error.status = 400;
      return next(error);
    }

    const user = await userService.deactivateUserForSchool(schoolId, userId);
    res.json({
      message: "User deactivated successfully",
      user,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get own profile (any authenticated user)
 */
export async function getMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const user = await userService.getOwnProfile(userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * Update own profile (any authenticated user)
 */
export async function updateMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.id;
    const { fullName } = req.body;

    if (!fullName) {
      const error: any = new Error("fullName is required");
      error.status = 400;
      return next(error);
    }

    const user = await userService.updateOwnProfile(userId, { fullName });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

