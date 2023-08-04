import pytest
from django.utils import timezone
from datetime import timezone as tz

from keeper.utils import generate_data_file, format_datetime
from django.core.files.uploadedfile import SimpleUploadedFile
import os

from tests.factories import AccessionFactory, FileFactory


@pytest.mark.django_db(transaction=True)
def test_generate_data_file(tmpdir):
    # Create an Accession object and related File objects
    accession = AccessionFactory()
    file_content = b"Some file content"
    file1 = FileFactory(accession=accession, file=SimpleUploadedFile("file1.txt", file_content))
    file2 = FileFactory(accession=accession, file=SimpleUploadedFile("file2.txt", file_content))

    # Generate filenames
    filenames = [(str(file1.file), file1.file_description), (str(file2.file), file2.file_description)]

    # Generate a data file
    path = tmpdir.mkdir("subdir")
    generate_data_file('keeper', 'accession', accession.pk, str(path), filenames)

    # Check that the metadata.txt file exists
    assert os.path.isfile(os.path.join(str(path), 'metadata.txt'))

    # Check the contents of the metadata.txt file
    with open(os.path.join(str(path), 'metadata.txt'), 'r') as f:
        contents = f.read()
        assert "Accession: {}".format(accession.pk) in contents
        assert "Date submitted: {}".format(format_datetime(timezone.localtime(accession.date_submitted))) in contents
        assert "Donor name: {}".format(accession.full_name) in contents
        assert "Email: {}".format(accession.email_address) in contents
        assert "Phone: {}".format(accession.phone_number) in contents
        assert "Accession description: {}".format(accession.description) in contents
        assert "Included files:" in contents
        assert str(file1.file) in contents
        assert str(file2.file) in contents


def test_format_datetime():
    # Test with a specific date and time
    dt = timezone.make_aware(timezone.datetime(2023, 8, 12, 15, 30), timezone=tz.utc)
    assert format_datetime(dt) == "2023-08-12 03:30 PM  UTC"

    # Test with current datetime
    now = timezone.now()
    assert format_datetime(now) == now.strftime('%Y-%m-%d %I:%M %p  %Z')

