def context(request):
    # stuff needed before defining context
    context = {
        'CANONICAL_PATH': request.build_absolute_uri(request.path),
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
        ]
    }

    return context