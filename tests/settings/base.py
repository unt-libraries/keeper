import os
import json
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

# JSON-based secrets module
with open(os.path.join(BASE_DIR, 'secrets.json')) as f:
    secrets = json.loads(f.read())


def get_secret(setting, secrets=secrets):
    """Get the secret variable or return explicit exception."""
    try:
        return secrets[setting]
    except KeyError:
        error_msg = 'Set the {0} environment variable'.format(setting)
        raise ImproperlyConfigured(error_msg)


SECRET_KEY = get_secret('SECRET_KEY')

ALLOWED_HOSTS = get_secret('ALLOWED_HOSTS')

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
        'ENGINE': 'django.db.backends.mysql',
        'NAME': get_secret('DATABASES_NAME'),
        'USER': get_secret('DATABASES_USER'),
        'PASSWORD': get_secret('DATABASES_PASSWORD'),
        'HOST': get_secret('DATABASES_HOST'),
        'PORT': get_secret('DATABASES_PORT'),
    }
}


LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'America/Chicago'

USE_I18N = True

USE_L10N = True

USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'

# Settings for reCAPTCHA

RECAPTCHA_PUBLIC_KEY = get_secret('RECAPTCHA_PUBLIC_KEY')
RECAPTCHA_PRIVATE_KEY = get_secret('RECAPTCHA_PRIVATE_KEY')
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
