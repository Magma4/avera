from unittest.mock import patch, MagicMock
import sys
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from ingest.tasks import ingest_source

print("Testing Celery Retry...")
