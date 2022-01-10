"""
WSGI config for keeper project.
It exposes the WSGI callable as a module-level variable named ``application``.
For more information on this file, see
https://docs.djangoproject.com/en/1.8/howto/deployment/wsgi/
"""

import os
import sys
import site

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
ENV = os.path.join(BASE_DIR, 'env')
SITE_PACKAGES = os.path.join(ENV, '/lib/python2.7/site-packages')

site.addsitedir(SITE_PACKAGES)
sys.path.append(BASE_DIR)

sys.path.append(os.path.join(BASE_DIR, 'keeper'))

os.environ.setdefault(
    'DJANGO_SETTINGS_MODULE',
    'tests.settings.settings'
)

activate_env = os.path.join(ENV, 'bin/activate_this.py')
exec(compile(open(activate_env, "rb").read(), activate_env, 'exec'), dict(__file__=activate_env))

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
