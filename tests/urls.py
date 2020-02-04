from __future__ import absolute_import
from django.urls import include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin

urlpatterns = [
    re_path(r'', include('keeper.urls')),
    re_path(r'^admin/', admin.site.urls),
    re_path(r'^private-media/', include('private_storage.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
