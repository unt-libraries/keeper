from django.urls import resolve

from keeper import views, admin_views


def test_intro():
    url = resolve('/intro/')
    assert url.func == views.intro


def test_index():
    url = resolve('/')
    assert url.func == views.index


def test_submit():
    url = resolve('/submit/')
    assert url.func == views.submit


def test_stats():
    url = resolve('/stats/')
    assert url.func == views.stats


def test_admin_zip_files():
    url = resolve('/admin/keeper/accession/000_zip')
    assert url.func == admin_views.zip_files
