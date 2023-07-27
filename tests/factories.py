import factory
from factory import fuzzy, faker

from django.utils import timezone

from keeper.models import Accession, File


class AccessionFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = Accession

    id = fuzzy.FuzzyInteger(1, 1000)
    date_submitted = fuzzy.FuzzyDateTime(timezone.now())
    date_last_updated = fuzzy.FuzzyDateTime(timezone.now())
    description = fuzzy.FuzzyText()
    first_name = faker.Faker('first_name')
    last_name = faker.Faker('last_name')
    affiliation = fuzzy.FuzzyChoice(key for key, _ in Accession.AFFILIATION_CHOICES)
    organization_name = fuzzy.FuzzyText()
    email_address = faker.Faker('email')
    phone_number = faker.Faker('phone_number')
    admin_notes = fuzzy.FuzzyText()
    accession_status = fuzzy.FuzzyChoice(key for key, _ in Accession.STATUS_CHOICES)


class FileFactory(factory.django.DjangoModelFactory):

    class Meta:
        model = File

    file = factory.django.FileField()
    accession = factory.SubFactory(AccessionFactory)
    file_description = fuzzy.FuzzyText()
    content_type = faker.Faker('mime_type')
    date_file_submitted = fuzzy.FuzzyDateTime(timezone.now())
