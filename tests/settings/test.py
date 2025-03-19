from .base import *

DEBUG = True

SECRET_KEY = os.environ.get('SECRET_KEY', 'testkey')

MEDIA_ROOT = os.path.join(BASE_DIR, 'private-media-test')
MEDIA_URL = '/private-media-test/'

# Settings for Django Private Storage
PRIVATE_STORAGE_ROOT = BASE_DIR.child('private-media-test')

# Override to save space and time in testing
MAX_UPLOAD_SIZE = 4 * 1024 * 1024  # 4 MB
