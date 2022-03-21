from django.conf import settings

def context(request):
    context = {
        'CANONICAL_PATH': request.build_absolute_uri(request.path),
        'BRANDING': settings.BRANDING,
    }

    return context