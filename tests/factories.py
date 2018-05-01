import factory
from factory import fuzzy

from django.utils import timezone

from keeper.models import Accession, File


class AccessionFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Accession

    id = fuzzy.FuzzyInteger(1, 1000)
    date_submitted = fuzzy.FuzzyDateTime(timezone.now())
    date_last_updated = fuzzy.FuzzyDateTime(timezone.now())
    description = fuzzy.FuzzyText()
    first_name = fuzzy.FuzzyText()
    last_name = fuzzy.FuzzyText()
    affiliation = fuzzy.FuzzyChoice(key for key, _ in Accession.AFFILIATION_CHOICES)
    organization_name = fuzzy.FuzzyText()
    email_address = factory.lazy_attribute(lambda o: o.first_name + '@example.com')
    phone_number = fuzzy.FuzzyText()
    admin_notes = fuzzy.FuzzyText()
    accession_status = fuzzy.FuzzyChoice(key for key, _ in Accession.STATUS_CHOICES)


class FileFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = File

    file = factory.django.FileField()
    accession = factory.SubFactory(AccessionFactory)
    file_description = fuzzy.FuzzyText()
    content_type = fuzzy.FuzzyText()
    date_file_submitted = fuzzy.FuzzyDateTime(timezone.now())
