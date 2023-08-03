from .base import *

DEBUG = True

MEDIA_ROOT = os.path.join(BASE_DIR, 'private-media-test')
MEDIA_URL = '/private-media-test/'

# Settings for Django Private Storage
PRIVATE_STORAGE_ROOT = BASE_DIR.child('private-media-test')
