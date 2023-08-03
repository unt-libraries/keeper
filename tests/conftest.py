import shutil
import pytest
from django.conf import settings


@pytest.fixture(scope="session", autouse=True)
def cleanup_after_tests():
    # Yield for running the tests
    yield

    # Code below this line will be executed after all tests have run
    shutil.rmtree(settings.MEDIA_ROOT)
