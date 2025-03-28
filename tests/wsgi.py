"""
WSGI config for keeper project.
It exposes the WSGI callable as a module-level variable named ``application``.
For more information on this file, see
https://docs.djangoproject.com/en/1.8/howto/deployment/wsgi/
"""

import os
import sys
import site

os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE',
    'tests.settings.settings'
)

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
