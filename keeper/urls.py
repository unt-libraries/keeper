from django.conf.urls import include, url
from django.contrib import admin

from keeper.views import intro, submit, index, stats
from keeper.admin_views import zip_files

urlpatterns = [
    url(r'^admin/', include(admin.site.urls)),
    url(r'^intro/$', intro, name='intro'),
    url(r'^$', index, name='index'),
    url(r'^submit/$', submit, name='submit'),
    url(r'^stats/$', stats, name='stats'),
    url(r'^admin/([^/]+)/([^/]+)/([^/]+)_zip', zip_files, name='zip'),
]
