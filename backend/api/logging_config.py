"""
logging_config.py

Structured logging setup.

In development the logs go to the console in a readable format,
coloured by level. In production they're JSON, one object per line,
so a log aggregator can index every field.
"""

import logging
import sys

from backend.api.settings import LOG_FORMAT, LOG_LEVEL


class _DevFormatter(logging.Formatter):
    """Short, readable console output for development."""

    COLORS = {
        "DEBUG": "\033[36m",     # cyan
        "INFO": "\033[32m",      # green
        "WARNING": "\033[33m",   # yellow
        "ERROR": "\033[31m",     # red
        "CRITICAL": "\033[35m",  # magenta
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelname, "")
        reset = self.RESET if color else ""
        ts = self.formatTime(record, "%H:%M:%S")
        return (
            f"{ts} {color}{record.levelname:<8}{reset} "
            f"{record.name}: {record.getMessage()}"
        )


def setup_logging():
    """
    Configure the root logger. Call once at startup.
    """
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if LOG_FORMAT == "json":
        from pythonjsonlogger.json import JsonFormatter

        formatter = JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
            },
        )
        handler.setFormatter(formatter)
    else:
        handler.setFormatter(_DevFormatter())

    root.addHandler(handler)
    root.setLevel(LOG_LEVEL)

    # Quiet down the libraries that are noisy at INFO.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_request_logger():
    """
    A logger specifically for request-level events. Uses the
    "api.request" name so a log aggregator can filter to just
    request logs.
    """
    return logging.getLogger("api.request")