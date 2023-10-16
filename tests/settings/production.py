from .base import *

DEBUG = False

# Settings for Django Private Storage at same level as BASE_DIR
MEDIA_ROOT = BASE_DIR.ancestor(1).child('private-media')

# Settings for SSL
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
