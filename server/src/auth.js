import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenSecret() {
  return process.env.JWT_SECRET;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

export function signAccessToken(user) {
  const secret = tokenSecret();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return jwt.sign({ sub: user.id, email: user.email }, secret, { expiresIn: "12h", issuer: "webhookhub-api", audience: "webhookhub-client" });
}

export function requireAuth(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "unauthorized", message: "Provide a Bearer access token." });
  }

  const secret = tokenSecret();
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "auth_not_configured", message: "Authentication is not configured on this server." });
  }

  try {
    const payload = jwt.verify(match[1], secret, {
      issuer: "webhookhub-api",
      audience: "webhookhub-client",
    });
    if (typeof payload.sub !== "string") throw new Error("Invalid subject");
    req.auth = { userId: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token", message: "The access token is invalid or expired." });
  }
}

export function createAuthRouter(prisma) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : null;

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return res.status(400).json({ error: "invalid_email", message: "Enter a valid email address." });
    }
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: "invalid_password", message: "Password must be between 10 and 128 characters." });
    }
    if (!tokenSecret() || tokenSecret().length < 32) {
      return res.status(503).json({ error: "auth_not_configured", message: "Set a JWT_SECRET of at least 32 characters before registering." });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash, name: name || null },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      return res.status(201).json({ user, accessToken: signAccessToken(user), tokenType: "Bearer", expiresIn: 43200 });
    } catch (error) {
      if (error?.code === "P2002") {
        return res.status(409).json({ error: "email_in_use", message: "An account with this email already exists." });
      }
      console.error("[auth:register_error]", error);
      return res.status(500).json({ error: "registration_failed", message: "The account could not be created." });
    }
  });

  router.post("/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!EMAIL_PATTERN.test(email) || !password || password.length > 128) {
      return res.status(400).json({ error: "invalid_credentials", message: "Enter a valid email and password." });
    }
    if (!tokenSecret() || tokenSecret().length < 32) {
      return res.status(503).json({ error: "auth_not_configured", message: "Authentication is not configured on this server." });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!passwordMatches) {
        return res.status(401).json({ error: "invalid_credentials", message: "Email or password is incorrect." });
      }
      return res.json({ user: publicUser(user), accessToken: signAccessToken(user), tokenType: "Bearer", expiresIn: 43200 });
    } catch (error) {
      console.error("[auth:login_error]", error);
      return res.status(500).json({ error: "login_failed", message: "Login could not be completed." });
    }
  });

  router.get("/me", requireAuth, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      if (!user) return res.status(401).json({ error: "user_not_found", message: "The account for this token no longer exists." });
      return res.json({ user });
    } catch (error) {
      console.error("[auth:me_error]", error);
      return res.status(500).json({ error: "profile_failed", message: "The profile could not be loaded." });
    }
  });

  return router;
}
