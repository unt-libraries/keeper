from .base import *

DEBUG = False

# Settings for Django Private Storage at same level as BASE_DIR
MEDIA_ROOT = BASE_DIR.ancestor(1).child('private-media')
