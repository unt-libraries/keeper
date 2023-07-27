import pytest
from django.contrib.auth.models import User
from django.test import RequestFactory

from keeper.admin_views import zip_files
from .factories import AccessionFactory, FileFactory
from django.core.files.uploadedfile import SimpleUploadedFile
from zipfile import ZipFile
from io import BytesIO


@pytest.fixture
def accession():
    return AccessionFactory()


@pytest.mark.django_db
def test_zip_files(accession):
    # Create a user
    user = User.objects.create_user(username='test', password='test')

    file_content = b"Some file content"
    file1 = FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))
    file2 = FileFactory(accession=accession, file=SimpleUploadedFile("file2.txt", file_content))

    # Mock a request
    request = RequestFactory().get('/dummy/')
    request.user = user

    # Call the zip_files view
    response = zip_files(request, 'keeper', 'accession', str(accession.pk))

    # Check that the response contains a valid ZIP file
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/zip'

    # Open the ZIP file and check its contents
    zip_file = ZipFile(BytesIO(b"".join(response.streaming_content)), 'r')

    # Strip 'uploads' and initial accession id from file name
    file1_name = '/'.join(file1.file.name.split('/')[2:])
    file2_name = '/'.join(file2.file.name.split('/')[2:])

    expected_files = {f"{accession.pk}/{file1_name}", f"{accession.pk}/{file2_name}", f"metadata.txt"}
    assert set(zip_file.namelist()) == expected_files

@pytest.mark.django_db
def test_zip_files_no_files(admin_client, accession):
    # Call the zip_files view
    url = f'/admin/keeper/accession/{accession.pk}_zip'
    response = admin_client.get(url)

    # Check that a 404 error is raised
    assert response.status_code == 404

@pytest.mark.django_db
def test_zip_files_non_existent_accession(admin_client):
    # Call the zip_files view with a non-existent Accession id
    url = '/admin/keeper/accession/999999_zip'
    response = admin_client.get(url)

    # Check that a 404 error is raised
    assert response.status_code == 404

@pytest.mark.django_db
def test_zip_files_without_login(client, accession):
    # Call the zip_files view without logging in
    url = f'/admin/keeper/accession/{accession.pk}_zip'
    response = client.get(url)

    # Check that the response is a redirect to the login page
    assert response.status_code == 302

@pytest.mark.django_db
def test_zip_files_metadata_contents(admin_client):
    # Create an Accession object and related File objects
    accession = AccessionFactory()
    file_content = b"Some file content"
    file1 = FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))
    file2 = FileFactory(accession=accession, file=SimpleUploadedFile("file2.txt", file_content))

    # Call the zip_files view
    url = f'/admin/keeper/accession/{accession.pk}_zip'
    response = admin_client.get(url)

    # Check that the response contains a valid ZIP file
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/zip'

    # Open the ZIP file and check its contents
    zip_file = ZipFile(BytesIO(b"".join(response.streaming_content)), 'r')
    assert set(zip_file.namelist()) == {f"{accession.pk}/file1.txt", f"{accession.pk}/file2.txt", "metadata.txt"}

    # Check the contents of the metadata.txt file
    metadata = zip_file.read('metadata.txt').decode('utf-8')
    assert "file1.txt" in metadata
    assert "file2.txt" in metadata
    assert accession.full_name in metadata
    assert accession.email_address in metadata
    assert accession.phone_number in metadata
    assert accession.description in metadata
    assert accession.get_affiliation_display() in metadata
    assert accession.admin_notes in metadata
    assert accession.get_accession_status_display() in metadata
    assert str(accession.pk) in metadata
    assert file1.file_description in metadata
    assert file2.file_description in metadata
    assert file1.get_filename() in metadata
    assert file2.get_filename() in metadata

