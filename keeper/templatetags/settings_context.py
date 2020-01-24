from __future__ import absolute_import
from django.conf import settings


def global_settings(request):
    """Make settings available to templates.

        defaults is a dictionary of settings to share with default values.
        Attempt to get settings values from the imported settings.
        If unavailable, use default values.
        """
    defaults = {'GA_TRACKING_ID': '',
                'RECAPTCHA_PUBLIC_KEY': ''}
    available_settings = {s: getattr(settings, s, defaults[s]) for s in defaults}
    return available_settings