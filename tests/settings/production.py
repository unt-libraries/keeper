from .base import *

DEBUG = False

# Settings for Django Private Storage at same level as BASE_DIR
MEDIA_ROOT = BASE_DIR.ancestor(1).child('private-media')

# Settings for SSL
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
