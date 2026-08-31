import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class VehiclesConfig(AppConfig):
    name = "vehicles"
    verbose_name = "Vehicles"

    def ready(self):
        """Create the MongoDB indexes once per process.

        A database that is temporarily unreachable must not stop the web
        process from booting -- ``/api/health/`` will report the problem and
        the indexes are re-checked on the next write.
        """
        from core import mongo

        try:
            mongo.ensure_indexes()
        except Exception as exc:  # pragma: no cover - startup resilience
            logger.warning(
                "Could not verify MongoDB indexes at startup: %s",
                exc.__class__.__name__,
            )
