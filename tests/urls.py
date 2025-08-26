"""keeper URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.8/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Add an import:  from blog import urls as blog_urls
    2. Add a URL to urlpatterns:  url(r'^blog/', include(blog_urls))

    URL setting for media in dev per:
    https://docs.djangoproject.com/en/dev/howto/static-files/#serving-files-uploaded-by-a-user-during-development
"""
from django.conf.urls import include
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import re_path
import private_storage.urls



urlpatterns = [
    re_path(r'', include('keeper.urls')),
    re_path(r'^admin/', admin.site.urls),
    re_path('^private-media/', include(private_storage.urls)),
    re_path('', include('dam.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
