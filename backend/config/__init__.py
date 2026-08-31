"""Project package.

Importing the Celery application here guarantees that ``@shared_task`` works
for every app in the project, no matter how Django is started.
"""

from config.celery import app as celery_app

__all__ = ("celery_app",)
