import pino from "pino";

// Define the log level from the environment variable, defaulting to "info"
const logLevel = process.env.NEXT_PUBLIC_LOG_LEVEL || "info";

// Create the logger instance
export const logger = pino({
    level: logLevel,
    // Use pino-pretty only in development for better readability
    // In production, it will output standard JSON logs
    ...(process.env.NODE_ENV === "development" && {
        transport: {
            target: "pino-pretty",
            options: {
                colorize: true,
                ignore: "pid,hostname",
                translateTime: "SYS:standard",
            },
        },
    }),
});
