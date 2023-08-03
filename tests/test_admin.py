import pytest
from django.urls import reverse

from keeper.models import Accession
from .factories import AccessionFactory


@pytest.fixture
def accession():
    return AccessionFactory()


@pytest.mark.django_db(transaction=True)
class TestAccessionAdmin:
    def test_load_accession_admin(self, admin_client, accession):
        url = reverse('admin:keeper_accession_change', args=(accession.id,))
        response = admin_client.get(url)
        assert response.status_code == 200

    def test_update_status_new(self, admin_client, accession):
        url = reverse('admin:keeper_accession_changelist')
        data = {
            'action': 'update_status_new',
            '_selected_action': [accession.pk],
        }
        response = admin_client.post(url, data, follow=True)
        accession.refresh_from_db()
        assert accession.accession_status == Accession.NEW
        assert response.status_code == 200

    def test_update_status_review(self, admin_client, accession):
        url = reverse('admin:keeper_accession_changelist')
        data = {
            'action': 'update_status_review',
            '_selected_action': [accession.pk],
        }
        response = admin_client.post(url, data, follow=True)
        accession.refresh_from_db()
        assert accession.accession_status == Accession.REVIEW
        assert response.status_code == 200

    def test_update_status_accepted(self, admin_client, accession):
        url = reverse('admin:keeper_accession_changelist')
        data = {
            'action': 'update_status_accepted',
            '_selected_action': [accession.pk],
        }
        response = admin_client.post(url, data, follow=True)
        accession.refresh_from_db()
        assert accession.accession_status == Accession.ACCEPTED
        assert response.status_code == 200

    def test_update_status_rejected(self, admin_client, accession):
        url = reverse('admin:keeper_accession_changelist')
        data = {
            'action': 'update_status_rejected',
            '_selected_action': [accession.pk],
        }
        response = admin_client.post(url, data, follow=True)
        accession.refresh_from_db()
        assert accession.accession_status == Accession.REJECTED
        assert response.status_code == 200

    def test_accession_list_display(self, admin_client):
        # Create multiple Accession objects
        AccessionFactory.create_batch(5)
        url = reverse('admin:keeper_accession_changelist')
        response = admin_client.get(url)
        assert response.status_code == 200
        # Check that all Accession objects are displayed
        assert Accession.objects.count() == len(response.context['cl'].result_list)

    def test_accession_list_ordering(self, admin_client):
        # Create multiple Accession objects
        AccessionFactory.create_batch(5)
        url = reverse('admin:keeper_accession_changelist')
        response = admin_client.get(url)
        assert response.status_code == 200
        # Check that Accession objects are ordered by id in descending order
        assert list(Accession.objects.order_by('-id')) == list(response.context['cl'].result_list)

    def test_accession_update_status_redirection(self, admin_client, accession):
        url = reverse('admin:keeper_accession_changelist')
        data = {
            'action': 'update_status_new',
            '_selected_action': [accession.pk],
        }
        response = admin_client.post(url, data)
        # Check that the response is a redirection to the changelist view
        assert response.status_code == 302
        assert response.url == url

    def test_filter_functionality(self, admin_client):
        # Create Accession object
        AccessionFactory(accession_status=Accession.NEW)
        AccessionFactory(accession_status=Accession.REVIEW)
        url = reverse('admin:keeper_accession_changelist')

        response = admin_client.get(url, {'accession_status__exact': Accession.NEW})
        assert response.status_code == 200
        assert Accession.objects.filter(accession_status=Accession.NEW).count() == len(response.context['cl'].result_list)

        response = admin_client.get(url, {'accession_status__exact': Accession.REVIEW})
        assert response.status_code == 200
        assert Accession.objects.filter(accession_status=Accession.REVIEW).count() == len(response.context['cl'].result_list)

    def test_admin_site_titles(self, admin_client):
        url = reverse('admin:keeper_accession_changelist')
        response = admin_client.get(url)
        assert response.status_code == 200
        assert response.context['site_title'] == 'Keeper by UNT Libraries'
        assert response.context['site_header'] == 'Keeper administration'
