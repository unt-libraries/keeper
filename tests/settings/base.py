import os
from unipath import Path

from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).ancestor(3)
MEDIA_ROOT = BASE_DIR.child('private-media')
MEDIA_URL = '/private-media/'

# Settings for Django Private Storage
PRIVATE_STORAGE_ROOT = MEDIA_ROOT
PRIVATE_STORAGE_AUTH_FUNCTION = 'private_storage.permissions.allow_staff'

# Gets the site root (same level that project, apps, and templates lives on)
SITE_ROOT = os.path.realpath(os.path.dirname(os.path.dirname(__file__)))

STATIC_ROOT = os.path.join(BASE_DIR, 'static')

# Not actually used right now, just needed for the staticfiles app.
STATIC_URL = '/static/'

STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'keeper/static'),
]

SECRET_KEY = os.environ.get('SECRET_KEY')

# 'DJANGO_ALLOWED_HOSTS' should be a single string of hosts with a space between each.
# For example: 'DJANGO_ALLOWED_HOSTS=localhost 127.0.0.1 [::1]'
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS").split(" ")

# Application definition

INSTALLED_APPS = (
    'keeper',
    'private_storage',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'parsley',
    'captcha',
)

MIDDLEWARE = (
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django.middleware.security.SecurityMiddleware',
)

ROOT_URLCONF = 'tests.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': (BASE_DIR.child('keeper', 'templates'),),
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'keeper.context_processor.context'
            ],
        },
    },
]

DATABASES = {
    'default': {
        'ENGINE': os.environ.get('DATABASES_ENGINE', 'django.db.backends.sqlite3'),
        'NAME': os.environ.get('DATABASES_NAME', 'keeper.db'),
        'USER': os.environ.get('DATABASES_USER', 'user'),
        'PASSWORD': os.environ.get('DATABASES_PASSWORD', 'password'),
        'HOST': os.environ.get('DATABASES_HOST', 'localhost'),
        'PORT': os.environ.get('DATABASES_PORT', '5432'),
    }
}


LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'America/Chicago'

USE_I18N = True

USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'

# Upload settings
MAX_UPLOAD_SIZE = 4 * 1024 * 1024 * 1024  # 4 GB

# Settings for reCAPTCHA

RECAPTCHA_PUBLIC_KEY = os.environ.get('RECAPTCHA_PUBLIC_KEY')
RECAPTCHA_PRIVATE_KEY = os.environ.get('RECAPTCHA_PRIVATE_KEY')
NOCAPTCHA = True

# Session settings

SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"
SESSION_COOKIE_HTTPONLY = True
