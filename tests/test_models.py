import os
import pytest
from unittest.mock import patch
from django.core.exceptions import ValidationError
from django.utils import timezone
from datetime import timedelta

from django.utils.html import format_html
from freezegun import freeze_time

from keeper import models
from keeper.models import File, Accession
from .factories import AccessionFactory, FileFactory


@pytest.mark.django_db(transaction=True)
class TestAccession:
    def test_full_name(self):
        accession = AccessionFactory()
        assert accession.full_name == '{} {}'.format(accession.first_name, accession.last_name)

    def test_unicode(self):
        accession = AccessionFactory.build()
        assert str(accession) == '{} {}'.format(accession.id, accession.last_name)

    def test_default_status(self):
        accession = models.Accession.objects.create(
            first_name="John",
            last_name="Doe",
            affiliation=models.Accession.STUDENT,
            email_address="johndoe@example.com",
        )
        assert accession.accession_status == models.Accession.NEW

    def test_invalid_email(self):
        accession = AccessionFactory.build(email_address="not a valid email")
        with pytest.raises(ValidationError):
            accession.full_clean()

    def test_invalid_affiliation(self):
        accession = AccessionFactory.build(affiliation="INVALID")
        with pytest.raises(ValidationError):
            accession.full_clean()

    def test_str_method(self):
        accession = AccessionFactory()
        assert str(accession) == '{} {}'.format(accession.id, accession.last_name)

    def test_date_fields(self):
        with freeze_time("2022-01-01"):
            accession = AccessionFactory()
            assert accession.date_submitted == timezone.now()
            assert accession.date_last_updated == timezone.now()

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            accession = AccessionFactory.build(first_name=None, last_name=None, email_address=None)
            accession.full_clean()

    def test_model_ordering(self):
        accession1 = AccessionFactory()
        accession1.date_submitted = timezone.now() - timedelta(days=1)
        accession1.save()

        accession2 = AccessionFactory()
        accession2.date_submitted = timezone.now()
        accession2.save()

        ids = [a.id for a in models.Accession.objects.all()]
        assert ids == [accession1.id, accession2.id]

    def test_invalid_status(self):
        accession = AccessionFactory.build(accession_status="INVALID")
        with pytest.raises(ValidationError):
            accession.full_clean()

    def test_date_last_updated_on_change(self):
        with freeze_time("2022-01-01"):
            accession = AccessionFactory()

        with freeze_time("2022-01-02"):
            accession.first_name = "New Name"
            accession.save()
            assert accession.date_last_updated == timezone.now()


@pytest.mark.django_db(transaction=True)
class TestFile:
    def test_get_filename(self):
        file = FileFactory()
        assert file.get_filename() == os.path.basename(file.file.name)

    def test_unicode(self):
        file = FileFactory()
        assert str(file) == file.get_filename()

    def test_file_download_element(self):
        file = FileFactory()
        with patch("os.path.basename", return_value="mocked_filename"):
            assert file.file_download_element() == format_html(
                '<a href="{0}" download="{1}">Download file</a>',
                file.file.url,
                "mocked_filename"
            )

    def test_image_thumb(self):
        file = FileFactory()
        with patch("os.path.basename", return_value="mocked_filename"):
            assert file.image_thumb() == format_html('<img src="{}" width="100" height="100" />', file.file.url)

    def test_icon_thumb(self):
        file = FileFactory(content_type='image/png')
        assert 'fa-file-image' in file.icon_thumb()  # assuming 'image/png' maps to 'fa-file-image'

        file = FileFactory(content_type='application/pdf')
        assert 'fa-file-pdf' in file.icon_thumb()  # assuming 'application/pdf' maps to 'fa-file-pdf'

        file = FileFactory(content_type='unknown/unknown')
        assert 'fa-file-o' in file.icon_thumb()  # 'unknown/unknown' should fall back to 'fa-file-o'

        file = FileFactory(content_type='image/png')
        assert '<i class="far fa-file-image fa-5x"></i>' in file.icon_thumb()  # replace with your specific icon class

        file = FileFactory(content_type='application/pdf')
        assert '<i class="far fa-file-pdf fa-5x"></i>' in file.icon_thumb()  # replace with your specific icon class

    def test_clickable_thumb_for_image(self):
        file = FileFactory(content_type='image/png')
        with patch("os.path.basename", return_value="mocked_filename"):
            assert '<img src="{}" width="100" height="100" />'.format(file.file.url) in file.clickable_thumb()

    def test_clickable_thumb_for_non_image(self):
        file = FileFactory(content_type='application/pdf')
        with patch("os.path.basename", return_value="mocked_filename"):
            assert '<i class="far fa-'.format(file.file.url) in file.clickable_thumb()

    def test_file_creation_with_accession(self):
        accession = AccessionFactory()
        file = FileFactory(accession=accession)
        assert file.accession == accession

    def test_file_submission_date(self):
        with freeze_time("2022-01-01"):
            file = FileFactory()
            assert file.date_file_submitted == timezone.now()

    def test_file_creation_with_description(self):
        file_description = "This is a test file."
        file = FileFactory(file_description=file_description)
        assert file.file_description == file_description


@pytest.mark.django_db(transaction=True)
class TestModelRelationships:
    def test_accession_deletion_removes_files(self):
        accession = AccessionFactory()
        file = FileFactory(accession=accession)

        assert File.objects.count() == 1

        accession.delete()

        # if you have models.CASCADE on the ForeignKey field, this should be 0
        # if not, this should still be 1
        assert File.objects.count() == 0
