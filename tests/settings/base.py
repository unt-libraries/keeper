import os
from unipath import Path

from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).ancestor(3)
MEDIA_ROOT = BASE_DIR.child('private-media')
MEDIA_URL = '/private-media/'

# Settings for Django Private Storage
PRIVATE_STORAGE_ROOT = BASE_DIR.child('private-media')
PRIVATE_STORAGE_AUTH_FUNCTION = 'private_storage.permissions.allow_staff'

# Gets the site root (same level that project, apps, and templates lives on)
SITE_ROOT = os.path.realpath(os.path.dirname(os.path.dirname(__file__)))

# Gets the current release root (same level as the env)
RELEASE_ROOT = os.path.realpath(os.path.dirname(os.path.dirname(SITE_ROOT)))

STATIC_ROOT = os.path.join(RELEASE_ROOT, 'static')

# Not actually used right now, just needed for the staticfiles app.
STATIC_URL = '/static/'

STATICFILES_DIRS = [
    os.path.join(RELEASE_ROOT, 'keeper/keeper/static'),
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

# Settings applicable to the UNT Libraries branding (header, footer, etc). Loaded by context_processor.py

BRANDING = {
    'GA_TRACKING_ID': 'G-LXJP4MHV86',
    'SIDEBAR_LINKS': [
        {
            'label': 'Special Collections',
            'url': 'https://library.unt.edu/special-collections/'
         },
        {
            'label': 'Rare and Unique Materials',
            'url': 'https://library.unt.edu/special-collections/rare-unique/'
        },
        {
            'label': 'Archives and Manuscripts',
            'url': 'https://library.unt.edu/special-collections/archives-manuscripts/'
        },
        {
            'label': 'Recursos en español',
            'url': 'https://library.unt.edu/special-collections/recursos-en-espanol/'
        },
        {
            'label': 'Research',
            'url': 'https://library.unt.edu/services/special-collections-research/'
        },
        {
            'label': 'Policies & Forms',
            'url': 'https://library.unt.edu/special-collections/policies-forms/'
        },
        {
            'label': 'Classroom & Group Visits',
            'url': 'https://library.unt.edu/services/special-collections-visitors/'
        },
        {
            'label': 'University Archive',
            'url': 'https://library.unt.edu/special-collections/archives-manuscripts/university-archive/'
        },
        {
            'label': 'Keeper',
            'url': 'https://library.unt.edu/special-collections/keeper/'
        },
    ],
    'SOCIAL': [
        {
            'name': 'facebook',
            'url': 'https://www.facebook.com/',
            'id': 'unt.libraries',
            'label': 'The UNT Libraries are on Facebook',
            'icon': 'facebook-f',
        },
        {
            'name': 'twitter',
            'url': 'https://twitter.com/',
            'id': 'unt_libraries',
            'label': 'Follow the UNT Libraries on Twitter',
            'icon': 'twitter',
        },
        {
            'name': 'instagram',
            'url': 'https://www.instagram.com/',
            'id': 'unt_libraries',
            'label': '"UNT Libraries on Instagram',
            'icon': 'instagram',
        },
        {
            'name': 'github',
            'url': 'https://github.com/',
            'id': 'unt-libraries',
            'label': 'UNT Libraries on Github',
            'icon': 'github-alt',
        },
        {
            'name': 'youtube',
            'url': 'https://www.youtube.com/channel/',
            'id': 'UCcbS9fXWKE1SpUTpl1sNB6Q',
            'label': 'UNT Libraries Youtube Channel',
            'icon': 'youtube',
        },
    ],
}
