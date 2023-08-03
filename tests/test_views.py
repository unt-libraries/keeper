import pytest
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from keeper.models import Accession, File


@pytest.fixture
def valid_accession_data():
    return {
        'accession-first_name': 'John',
        'accession-last_name': 'Doe',
        'accession-email_address': 'johndoe@example.com',
        'accession-phone_number': '123456789',
        'accession-description': 'Test description',
        'accession-affiliation': 'STU',
    }


@pytest.fixture
def invalid_accession_data():
    return {
        'accession-first_name': 'John',
        'accession-last_name': 'Doe',
        'accession-email_address': 'johndoe@example.com',
        'accession-phone_number': '123456789',
        'accession-description': 'Test description',
        'accession-affiliation': 'NOT VALID',
    }


@pytest.fixture
def valid_file_data():
    content = b"file_content"
    file = SimpleUploadedFile("file.txt", content, content_type="text/plain")
    return {
        'file-file': file,
        'file-file_description': 'Test file description',
    }


@pytest.fixture
def invalid_file_data():
    invalid_file_content = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00..."
    return {
        'file-file': SimpleUploadedFile("file.exe", invalid_file_content, content_type="application/x-msdownload"),
        'file-file_description': 'Test file description',
    }


def test_intro_view(client):
    url = reverse('keeper:intro')
    response = client.get(url)
    assert response.status_code == 200
    assert 'keeper/intro.html' in [template.name for template in response.templates]


def test_index_view(client):
    response = client.get('/')
    assert response.status_code == 200
    assert 'keeper/index.html' in [template.name for template in response.templates]
    assert 'accepted_file_types' in response.context
    assert 'affiliation_choices' in response.context
    assert 'accession_form' in response.context
    assert 'file_form' in response.context


@pytest.mark.django_db(transaction=True)
def test_submit_view_with_valid_data(client, valid_accession_data, valid_file_data):
    # Merge the valid_accession_data and valid_file_data
    post_data = {**valid_accession_data, **valid_file_data}

    response = client.post('/submit/', data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is True
    assert 'template' in json_data


@pytest.mark.django_db(transaction=True)
def test_submit_view_with_invalid_data(client, invalid_accession_data, invalid_file_data):
    response = client.post('/submit/', data={'accession': invalid_accession_data, 'file': invalid_file_data})
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    assert 'errorsForm' in json_data
    assert 'errorsFile' in json_data


@pytest.mark.django_db(transaction=True)
def test_submit_view_missing_required_fields(client, valid_accession_data, valid_file_data):
    valid_accession_data.pop('accession-first_name') # Remove a required field
    post_data = {**valid_accession_data, **valid_file_data}
    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    assert 'first_name' in json_data['errorsForm']


@pytest.mark.django_db(transaction=True)
def test_submit_view_invalid_file_type(client, valid_accession_data, invalid_file_data):
    post_data = {**valid_accession_data, **invalid_file_data}
    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    print(json_data)
    assert len(json_data['errorsFile']) == 1


@pytest.mark.django_db(transaction=True)
def test_submit_view_mixed_files(client, valid_accession_data, valid_file_data, invalid_file_data):
    post_data = {**valid_accession_data,
                 'file-file': [valid_file_data['file-file'], invalid_file_data['file-file']],
                 'file-file_description': ['Test file description', 'Invalid file description']}
    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    assert len(json_data['errorsFile']) == 1


@pytest.mark.django_db(transaction=True)
def test_submit_view_with_multiple_valid_files(client, valid_accession_data, valid_file_data):
    content = b"file_content"
    file1 = SimpleUploadedFile("file1.txt", content, content_type="text/plain")
    file2 = SimpleUploadedFile("file2.txt", content, content_type="text/plain")

    multiple_valid_files_data = {
        'file-file': [file1, file2],
        'file-file_description': ['Test file description 1', 'Test file description 2'],
    }
    post_data = {**valid_accession_data, **multiple_valid_files_data}

    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()

    # Check for success
    assert json_data['success'] is True, f"Unexpected failure: {json_data.get('errors', 'Unknown error')}"

    # Check that the correct number of file records were created
    files = File.objects.filter(file_description__in=['Test file description 1', 'Test file description 2'])
    assert files.count() == 2

    expected_content = valid_file_data['file-file'].read()

    # Check that the files have the expected content, etc.
    for file in files:
        assert file.get_filename() in ["file1.txt", "file2.txt"], "Unexpected file name"
        assert file.file.read() == content, "File content does not match"
        with open(file.file.path, 'rb') as f:
            assert f.read() == expected_content


@pytest.mark.django_db(transaction=True)
def test_submit_view_session_data(client, valid_accession_data, valid_file_data):
    post_data = {**valid_accession_data, **valid_file_data}

    url = reverse('keeper:submit') # Replace with the actual view name
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is True

    # Check if the session data is correctly set
    session_data = response.wsgi_request.session.get('accession')
    assert session_data['first_name'] == valid_accession_data['accession-first_name']
    assert session_data['last_name'] == valid_accession_data['accession-last_name']
    assert session_data['email_address'] == valid_accession_data['accession-email_address']
    assert session_data['phone_number'] == valid_accession_data['accession-phone_number']
    assert session_data['description'] == valid_accession_data['accession-description']
    assert session_data['affiliation'] == valid_accession_data['accession-affiliation']


@pytest.mark.django_db(transaction=True)
def test_submit_view_with_empty_file(client, valid_accession_data):
    empty_file = SimpleUploadedFile("empty.txt", b"", content_type="text/plain")
    post_data = {**valid_accession_data, 'file-file': empty_file, 'file-file_description': 'Empty file'}
    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    assert 'errorsFile' in json_data


@pytest.mark.django_db(transaction=True)
def test_submit_view_with_large_file(client, valid_accession_data):
    large_file_content = b"A" * (settings.MAX_UPLOAD_SIZE + 1)  # Max Upload is overridden in settings.test.py
    large_file = SimpleUploadedFile("large.txt", large_file_content, content_type="text/plain")
    post_data = {**valid_accession_data, 'file-file': large_file, 'file-file_description': 'Large file'}
    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is False
    assert 'errorsFile' in json_data


@pytest.mark.django_db(transaction=True)
def test_special_characters_in_input_fields(client, valid_file_data):
    special_characters_data = {
        'accession-first_name': 'John\'"; DROP TABLE --',
        'accession-last_name': 'Doe',
        'accession-email_address': 'johndoe@example.com',
        'accession-phone_number': '123456789',
        'accession-description': 'Test description with special characters: !@#$%^&*()',
        'accession-affiliation': 'STU',
    }
    post_data = {**special_characters_data, **valid_file_data}

    url = reverse('keeper:submit')
    response = client.post(url, data=post_data)
    assert response.status_code == 200
    json_data = response.json()
    assert json_data['success'] is True

    # Check that the special characters were stored correctly in the database
    accession = Accession.objects.get(email_address='johndoe@example.com')
    assert accession.first_name == special_characters_data['accession-first_name']

    # Check that no unexpected error messages are present in the response
    assert 'error' not in json_data


@pytest.mark.django_db(transaction=True)
def test_stats_view(client):
    response = client.get('/stats/')
    assert response.status_code == 200
    assert 'keeper/stats.html' in [template.name for template in response.templates]
    assert 'accession_count' in response.context
    assert 'file_count' in response.context
