import pytest
from unittest import mock
from django.core.files.uploadedfile import SimpleUploadedFile
from keeper.forms import AccessionForm, FileForm
from keeper.models import File, Accession
from keeper.constants import ACCEPTED_FILE_TYPES
from .factories import AccessionFactory, FileFactory


@pytest.mark.django_db(transaction=True)
class TestAccessionForm:
    def test_valid_form(self):
        accession = AccessionFactory()
        data = {
            'first_name': accession.first_name,
            'last_name': accession.last_name,
            'email_address': accession.email_address,
            'phone_number': accession.phone_number,
            'description': accession.description,
            'affiliation': accession.affiliation,
        }

        form = AccessionForm(data=data)
        assert form.is_valid()

    def test_invalid_form(self):
        data = {}  # no data
        form = AccessionForm(data=data)
        assert not form.is_valid()

    def test_form_initialization(self):
        accession = AccessionFactory()
        form = AccessionForm(instance=accession)
        assert form.initial['first_name'] == accession.first_name
        assert form.initial['last_name'] == accession.last_name
        assert form.initial['email_address'] == accession.email_address
        assert form.initial['phone_number'] == accession.phone_number
        assert form.initial['description'] == accession.description
        assert form.initial['affiliation'] == accession.affiliation

    def test_form_save(self):
        data = {
            'first_name': 'John',
            'last_name': 'Doe',
            'email_address': 'johndoe@example.com',
            'phone_number': '123456789',
            'description': 'Test description',
            'affiliation': Accession.STUDENT,
        }
        form = AccessionForm(data=data)
        assert form.is_valid()
        saved_accession = form.save()
        db_accession = Accession.objects.get(id=saved_accession.id)
        assert db_accession.first_name == data['first_name']
        assert db_accession.last_name == data['last_name']
        assert db_accession.email_address == data['email_address']
        assert db_accession.phone_number == data['phone_number']
        assert db_accession.description == data['description']
        assert db_accession.affiliation == data['affiliation']

    def test_form_errors(self):
        data = {}  # Invalid data
        form = AccessionForm(data=data)
        assert not form.is_valid()
        assert 'This field is required.' in form.errors['first_name']
        assert 'This field is required.' in form.errors['last_name']
        assert 'This field is required.' in form.errors['email_address']
        assert 'This field is required.' in form.errors['affiliation']


@pytest.mark.django_db(transaction=True)
class TestFileForm:
    def test_valid_form(self):
        content = b"file_content"
        file = FileFactory(file=SimpleUploadedFile("file.txt", content, content_type="text/plain"))
        data = {
            'file_description': file.file_description,
        }
        files = {
            'file': file.file,
        }
        form = FileForm(data=data, files=files)
        assert form.is_valid(), form.errors

    def test_invalid_form(self):
        data = {}  # no data
        form = FileForm(data=data)
        assert not form.is_valid()

    def test_form_initialization(self):
        content = b"file_content"
        file = FileFactory(file=SimpleUploadedFile("file.txt", content, content_type="text/plain"))
        form = FileForm(instance=file)
        assert form.initial['file_description'] == file.file_description
        assert form.initial['file'].read() == content

    def test_form_save(self):
        content = b"file_content"
        accession = AccessionFactory()
        file = SimpleUploadedFile("file.txt", content, content_type="text/plain")
        data = {
            'file_description': 'Test file description',
        }
        files = {
            'file': file,
        }
        form = FileForm(data=data, files=files)
        assert form.is_valid()
        saved_file = form.save(commit=False)
        saved_file.accession = accession
        saved_file.save()
        db_file = File.objects.get(id=saved_file.id)
        assert db_file.file_description == data['file_description']
        assert db_file.file.read() == content

    def test_form_errors(self):
        data = {}  # Invalid data
        form = FileForm(data=data)
        assert not form.is_valid()
        assert 'This field is required.' in form.errors['file']

    @mock.patch.dict(ACCEPTED_FILE_TYPES, {"application/pdf": "file-pdf"}, clear=True)
    def test_invalid_file_format(self):
        content = b"file_content"
        invalid_file = SimpleUploadedFile("file.txt", content, content_type="text/plain")  # TXT file, which is not in the ACCEPTED_FILE_TYPES
        data = {
            'file_description': 'Test file description',
        }
        files = {
            'file': invalid_file,
        }
        form = FileForm(data=data, files=files)
        assert not form.is_valid()  # The form should not be valid

    @mock.patch.dict(ACCEPTED_FILE_TYPES, {"text/plain": "file-alt"}, clear=True)
    def test_valid_file_format(self):
        content = b"file_content"
        valid_file = SimpleUploadedFile("file.txt", content, content_type="text/plain")  # TXT file, which is in the ACCEPTED_FILE_TYPES
        data = {
            'file_description': 'Test file description',
        }
        files = {
            'file': valid_file,
        }
        form = FileForm(data=data, files=files)
        assert form.is_valid()  # The form should be valid
