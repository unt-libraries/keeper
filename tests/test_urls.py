import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from .factories import AccessionFactory, FileFactory

from keeper import urls


@pytest.mark.django_db(transaction=True)
class TestUrls:
    def test_admin_url(self, client, admin_client):
        response = client.get('/admin/')
        assert response.status_code == 302
        response = admin_client.get('/admin/')
        assert response.status_code == 200

    def test_intro_url(self, client):
        response = client.get(reverse('keeper:intro'))
        assert response.status_code == 200

    def test_index_url(self, client):
        response = client.get(reverse('keeper:index'))
        assert response.status_code == 200

    def test_submit_url(self, client):
        data = {
            'field1': 'dummy value',
            'field2': 'another dummy value',
        }
        response = client.post(reverse('keeper:submit'), data)
        assert response.status_code == 200

    def test_stats_url(self, client):
        response = client.get(reverse('keeper:stats'))
        assert response.status_code == 200

    def test_zip_files_url(self, admin_client):
        # Create an Accession object
        accession = AccessionFactory()

        # Create a File object associated with the Accession
        file_content = b"Some file content"
        FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))

        # Call the zip_files view
        url = f'/admin/keeper/accession/{accession.pk}_zip'

        response = admin_client.get(url)
        assert response.status_code == 200

    def test_zip_files_url_requires_login(self, client):
        # Create an Accession object
        accession = AccessionFactory()

        # Create a File object associated with the Accession
        file_content = b"Some file content"
        FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))

        # Call the zip_files view
        url = f'/admin/keeper/accession/{accession.pk}_zip'

        response = client.get(url)
        assert response.status_code == 302

    def test_zip_files_url_non_existent_accession(self, admin_client):
        # Call the zip_files view with a non-existent Accession id
        url = '/admin/keeper/accession/999999_zip'
        response = admin_client.get(url)

        # Check that a 404 error is raised
        assert response.status_code == 404

    def test_zip_files_url_requires_admin(self, client):
        # Create an Accession object
        accession = AccessionFactory()

        # Create a File object associated with the Accession
        file_content = b"Some file content"
        FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))

        # Call the zip_files view
        url = f'/admin/keeper/accession/{accession.pk}_zip'

        response = client.get(url)
        assert response.status_code == 302
