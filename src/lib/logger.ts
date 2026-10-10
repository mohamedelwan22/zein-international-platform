import { pino, type Logger, type LoggerOptions } from "pino";
import { env } from "@/lib/env";

const opts: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "zein-b2b-platform" },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "AUTH_SECRET",
      "S3_SECRET_KEY",
      "req.headers.authorization",
      "*.token",
    ],
    censor: "[redacted]",
  },
};

export const logger: Logger = pino(opts);

export function createLogger(name: string): Logger {
  return logger.child({ module: name });
}

export function withRequestId(requestId: string): Logger {
  return logger.child({ requestId });
}