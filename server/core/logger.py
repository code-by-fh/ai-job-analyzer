import logging
import os
import sys


def get_logger(name: str) -> logging.Logger:
    """
    Returns a configured logger instance with the specified name.
    Log level is controlled by the LOG_LEVEL environment variable (default: INFO).
    """
    logger = logging.getLogger(name)

    # Only configure if no handlers are set to prevent duplicate logs
    if not logger.handlers:
        log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
        log_level = getattr(logging, log_level_str, logging.INFO)

        logger.setLevel(log_level)

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(log_level)

        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)

        logger.addHandler(handler)
        logger.propagate = False

    return logger
