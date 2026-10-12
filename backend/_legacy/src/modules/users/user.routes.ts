import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { rbac } from "../../middlewares/rbac.middleware";
import * as userController from "./user.controller";

const router = Router();

// Admin-only routes
router.get(
  "/",
  authMiddleware,
  rbac(["ADMIN"]),
  userController.listUsers
);

router.get(
  "/:id",
  authMiddleware,
  rbac(["ADMIN"]),
  userController.getUserById
);

router.post(
  "/",
  authMiddleware,
  rbac(["ADMIN"]),
  userController.createUser
);

router.put(
  "/:id",
  authMiddleware,
  rbac(["ADMIN"]),
  userController.updateUser
);

router.delete(
  "/:id",
  authMiddleware,
  rbac(["ADMIN"]),
  userController.deleteUser
);

// Self profile routes (any authenticated user)
router.get(
  "/me/profile",
  authMiddleware,
  userController.getMe
);

router.put(
  "/me/profile",
  authMiddleware,
  userController.updateMe
);

export default router;

