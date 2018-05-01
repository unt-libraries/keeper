import os
import pytest

from keeper import models
from .factories import AccessionFactory, FileFactory


@pytest.mark.django_db
class TestAccession:
    def test_full_name(self):
        accession = AccessionFactory.build()
        assert accession.full_name == '{} {}'.format(accession.first_name, accession.last_name)

    def test_unicode(self):
        accession = AccessionFactory.build()
        assert unicode(accession) == '{} {}'.format(accession.id, accession.last_name)


@pytest.mark.django_db
class TestFile:
    def test_get_filename(self):
        pass

    def test_unicode(self):
        file = FileFactory()
        assert unicode(file) == file.get_filename()
